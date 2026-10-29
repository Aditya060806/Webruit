/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { buildContentMarkdownExpression } from '@browseros/browser-core/content-markdown'
import { z } from 'zod/v4'
import {
  abortableDelay,
  defineTool,
  type ToolContext,
  textResult,
  throwIfAborted,
} from './framework'
import { wrapUntrusted } from './trust-boundary'

const READ_PAGES_MAX_URLS = 8
const CONCURRENCY = 3
const DEFAULT_MAX_CHARS = 4_000
const MAX_CHARS_CEILING = 12_000
const READY_TIMEOUT_MS = 10_000
const READY_POLL_MS = 250
// Client-rendered pages often fill in just after readyState reaches "complete".
const SETTLE_MS = 600

interface ReadPageOutcome {
  url: string
  finalUrl?: string
  title?: string
  ok: boolean
  error?: string
  contentLength: number
  truncated: boolean
  content?: string
}

function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

async function waitForReady(
  evaluate: (expression: string) => Promise<unknown>,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const state = await evaluate('document.readyState').catch(() => undefined)
    if (state === 'complete') break
    await abortableDelay(READY_POLL_MS, signal)
  }
  await abortableDelay(SETTLE_MS, signal)
}

async function readOne(
  url: string,
  maxChars: number,
  ctx: ToolContext,
): Promise<ReadPageOutcome> {
  if (!isWebUrl(url)) {
    return {
      url,
      ok: false,
      error: 'Only http and https URLs can be read.',
      contentLength: 0,
      truncated: false,
    }
  }

  let pageId: number | undefined
  try {
    pageId = await ctx.session.pages.newPage(url, {
      background: true,
      windowId: ctx.defaultWindowId,
      tabGroupId: ctx.defaultTabGroupId,
    })
    const { session } = await ctx.session.pages.getSession(pageId)
    const evaluate = async (expression: string) => {
      const result = await session.Runtime.evaluate({
        expression,
        returnByValue: true,
      })
      if (result.exceptionDetails) {
        throw new Error(
          result.exceptionDetails.exception?.description ??
            result.exceptionDetails.text,
        )
      }
      return result.result?.value
    }

    await waitForReady(evaluate, ctx.signal)
    const text = String(
      (await evaluate(buildContentMarkdownExpression({}))) ?? '',
    )
    const info = await ctx.session.pages.refresh(pageId)
    const truncated = text.length > maxChars
    return {
      url,
      finalUrl: info?.url,
      title: info?.title || undefined,
      ok: true,
      contentLength: text.length,
      truncated,
      content: truncated ? text.slice(0, maxChars) : text,
    }
  } catch (err) {
    if (ctx.signal?.aborted) throw err
    return {
      url,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      contentLength: 0,
      truncated: false,
    }
  } finally {
    if (pageId !== undefined) {
      await ctx.session.pages.close(pageId).catch(() => {})
    }
  }
}

/** Runs readOne over the URLs with a small worker pool, keeping results in input order. */
async function readPagesInPool(
  urls: string[],
  maxChars: number,
  ctx: ToolContext,
): Promise<ReadPageOutcome[]> {
  const results: ReadPageOutcome[] = new Array(urls.length)
  let next = 0
  const worker = async () => {
    while (next < urls.length) {
      throwIfAborted(ctx.signal)
      const index = next++
      results[index] = await readOne(urls[index], maxChars, ctx)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker),
  )
  return results
}

function formatOutcome(outcome: ReadPageOutcome, index: number): string {
  const header = `## ${index + 1}. ${outcome.title ?? outcome.url}\nurl: ${outcome.finalUrl ?? outcome.url}`
  if (!outcome.ok) return `${header}\nerror: ${outcome.error}`
  const note = outcome.truncated
    ? `\n(first ${outcome.content?.length} of ${outcome.contentLength} characters; use tabs + read or grep on this URL for the rest)`
    : ''
  return `${header}${note}\n${wrapUntrusted(outcome.content || '(empty)', outcome.finalUrl ?? outcome.url)}`
}

export const read_pages = defineTool({
  name: 'read_pages',
  description: `Read several web pages at once without disturbing the user's tabs. Opens each URL in a background tab, waits for it to load, returns its content as markdown, then closes the tab. Use it to gather facts from a list of pages (company sites, profiles, search results) instead of visiting them one by one. Up to ${READ_PAGES_MAX_URLS} URLs per call; failed pages are reported, not fatal.`,
  input: z
    .object({
      urls: z
        .array(z.string().min(1))
        .min(1)
        .max(READ_PAGES_MAX_URLS)
        .describe('http(s) URLs to read.'),
      maxCharsPerPage: z
        .number()
        .int()
        .min(500)
        .max(MAX_CHARS_CEILING)
        .optional()
        .describe(
          `Characters of content to return per page (default ${DEFAULT_MAX_CHARS}).`,
        ),
    })
    .strict(),
  annotations: {
    title: 'Read pages in background tabs',
    readOnlyHint: false,
    openWorldHint: true,
  },
  handler: async (args, ctx) => {
    const urls = [...new Set(args.urls.map((url) => url.trim()))]
    const outcomes = await readPagesInPool(
      urls,
      args.maxCharsPerPage ?? DEFAULT_MAX_CHARS,
      ctx,
    )
    const okCount = outcomes.filter((o) => o.ok).length
    const text = [
      `Read ${okCount} of ${outcomes.length} pages.`,
      ...outcomes.map(formatOutcome),
    ].join('\n\n')
    return textResult(text, {
      pages: outcomes.map(({ content: _content, ...rest }) => rest),
    })
  },
})
