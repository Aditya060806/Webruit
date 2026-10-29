/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import type { BrowserSession } from '@browseros/browser-core/core/session'
import { executeTool } from './framework'
import { read_pages } from './read-pages'

interface FakePage {
  url: string
  body?: string
  failOpen?: boolean
}

function fakeSession(pages: Record<string, FakePage>) {
  const open = new Map<number, FakePage>()
  const closed: number[] = []
  const openedUrls: string[] = []
  let nextId = 1
  const session = {
    pages: {
      newPage: async (url: string, opts: { background?: boolean }) => {
        if (!opts.background) throw new Error('expected a background tab')
        openedUrls.push(url)
        const page = pages[url]
        if (!page || page.failOpen) throw new Error(`cannot open ${url}`)
        const id = nextId++
        open.set(id, page)
        return id
      },
      getSession: async (id: number) => ({
        session: {
          Runtime: {
            evaluate: async ({ expression }: { expression: string }) => ({
              result: {
                value:
                  expression === 'document.readyState'
                    ? 'complete'
                    : (open.get(id)?.body ?? ''),
              },
            }),
          },
        },
      }),
      refresh: async (id: number) => ({
        url: open.get(id)?.url,
        title: `Title of ${open.get(id)?.url}`,
      }),
      close: async (id: number) => {
        closed.push(id)
        open.delete(id)
      },
    },
  } as unknown as BrowserSession
  return { session, closed, openedUrls, open }
}

function textOf(result: { content?: unknown }): string {
  return (result.content as { type: string; text?: string }[])
    .map((item) => item.text ?? '')
    .join('\n')
}

describe('read_pages', () => {
  it('reads each URL in a background tab and closes every tab it opened', async () => {
    const fake = fakeSession({
      'https://a.example': { url: 'https://a.example/', body: 'Alpha Inc' },
      'https://b.example': { url: 'https://b.example/', body: 'Beta LLC' },
    })
    const result = await executeTool(
      read_pages,
      { urls: ['https://a.example', 'https://b.example'] },
      { session: fake.session },
    )

    expect(result.isError).toBeFalsy()
    const text = textOf(result)
    expect(text).toContain('Read 2 of 2 pages.')
    expect(text).toContain('Alpha Inc')
    expect(text).toContain('Beta LLC')
    expect(text).toContain('UNTRUSTED_PAGE_CONTENT')
    expect(fake.closed.sort()).toEqual([1, 2])
    expect(fake.open.size).toBe(0)
  })

  it('reports failed and non-web URLs without failing the whole call', async () => {
    const fake = fakeSession({
      'https://ok.example': { url: 'https://ok.example/', body: 'Fine' },
      'https://down.example': { url: '', failOpen: true },
    })
    const result = await executeTool(
      read_pages,
      {
        urls: ['https://ok.example', 'https://down.example', 'file:///etc/x'],
      },
      { session: fake.session },
    )

    expect(result.isError).toBeFalsy()
    const pages = (result.structuredContent as { pages: { ok: boolean }[] })
      .pages
    expect(pages.map((p) => p.ok)).toEqual([true, false, false])
    expect(textOf(result)).toContain('Only http and https URLs can be read.')
    expect(fake.openedUrls).not.toContain('file:///etc/x')
  })

  it('truncates long pages to maxCharsPerPage and says so', async () => {
    const fake = fakeSession({
      'https://long.example': {
        url: 'https://long.example/',
        body: 'x'.repeat(2_000),
      },
    })
    const result = await executeTool(
      read_pages,
      { urls: ['https://long.example'], maxCharsPerPage: 500 },
      { session: fake.session },
    )

    const [page] = (
      result.structuredContent as {
        pages: { truncated: boolean; contentLength: number }[]
      }
    ).pages
    expect(page.truncated).toBe(true)
    expect(page.contentLength).toBe(2_000)
    expect(textOf(result)).toContain('first 500 of 2000 characters')
  })

  it('rejects more than eight URLs', async () => {
    const fake = fakeSession({})
    const urls = Array.from({ length: 9 }, (_, i) => `https://${i}.example`)
    const result = await executeTool(
      read_pages,
      { urls },
      { session: fake.session },
    )
    expect(result.isError).toBe(true)
    expect(fake.openedUrls).toHaveLength(0)
  })
})
