/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { RiskTier } from '@browseros/shared/schemas/permissions'

/** What the policy engine needs to know about one tool call. */
export interface ClassifiedCall {
  tool: string
  tier: RiskTier
  /** Connector server name, or the page's domain for browser actions. */
  app?: string
  /** Connector action name, or the act kind. */
  action?: string
  /** URLs the call would open, for companion site limits. */
  navigatesTo: string[]
  summary: string
  details: string[]
}

export interface ClassifyContext {
  /** URL of the page the call targets, when it names one. */
  pageUrl?: string
  /** Role and visible name of each act ref, from the page's last snapshot. */
  refLabel?: (ref: string) => { role: string; name: string } | undefined
}

const READ_TOOLS = new Set([
  'snapshot',
  'diff',
  'read',
  'read_pages',
  'grep',
  'screenshot',
  'wait',
  'history',
  'pdf',
  'request_handoff',
  'discover_server_categories_or_actions',
  'get_category_actions',
  'get_action_details',
  'search_documentation',
  'handle_auth_failure',
])

// Button and action words that make a click or connector call riskier than a plain write.
const FINANCIAL =
  /\b(pay|payment|buy|purchase|checkout|check out|place order|order now|subscribe|donate|transfer|send money|charge|refund|top up|upgrade plan)\b/i
const DESTRUCTIVE =
  /\b(delete|remove|erase|destroy|discard|trash|empty|unsubscribe|deactivate|close account|cancel (my )?(subscription|account|order|plan)|revoke)\b/i
const SEND =
  /\b(send|post|publish|reply|submit|share|invite|tweet|forward|schedule send)\b/i
const CREDENTIAL_FIELD =
  /\b(password|passcode|passwd|pin|cvv|cvc|security code|card number|credit card|iban|routing number|ssn|social security|one[- ]time code|otp|2fa|verification code|secret|api key|token)\b/i

const MAX_DETAIL = 160

function clip(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL)}…` : text
}

export function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

function escalate(text: string, base: RiskTier): RiskTier {
  if (FINANCIAL.test(text)) return 'financial'
  if (DESTRUCTIVE.test(text)) return 'destructive'
  if (SEND.test(text)) return 'send_message'
  return base
}

function classifyAct(
  args: Record<string, unknown>,
  ctx: ClassifyContext,
  site: string | undefined,
): ClassifiedCall {
  const kind = typeof args.kind === 'string' ? args.kind : 'act'
  const where = site ? ` on ${site}` : ''
  const label = (ref: unknown) =>
    typeof ref === 'string' ? ctx.refLabel?.(ref) : undefined

  if (kind === 'fill' || kind === 'type' || kind === 'type_at') {
    const fields: Array<{ ref?: unknown; value?: unknown }> = Array.isArray(
      args.fields,
    )
      ? (args.fields as Array<{ ref?: unknown; value?: unknown }>)
      : [{ ref: args.ref, value: args.value ?? args.text }]
    const named = fields.map((field) => ({
      name: label(field.ref)?.name ?? '',
      value: field.value,
    }))
    const credential = named.some((field) => CREDENTIAL_FIELD.test(field.name))
    return {
      tool: 'act',
      tier: credential ? 'credential' : 'write_external',
      app: site,
      action: kind,
      navigatesTo: [],
      summary: credential
        ? `Type into a password or payment field${where}`
        : `Type into ${named.length} field${named.length === 1 ? '' : 's'}${where}`,
      // Never echo what would go into a credential field.
      details: named.map(({ name, value }) =>
        CREDENTIAL_FIELD.test(name)
          ? `${name || 'field'}: (hidden)`
          : `${name || 'field'}: ${clip(value ?? '')}`,
      ),
    }
  }

  if (kind === 'press') {
    const key = typeof args.key === 'string' ? args.key : ''
    return {
      tool: 'act',
      tier: 'write_external',
      app: site,
      action: kind,
      navigatesTo: [],
      summary: `Press ${key || 'a key'}${where}`,
      details: [],
    }
  }

  if (kind === 'hover' || kind === 'focus' || kind === 'scroll') {
    return {
      tool: 'act',
      tier: 'read',
      app: site,
      action: kind,
      navigatesTo: [],
      summary: `${kind}${where}`,
      details: [],
    }
  }

  const target = label(args.ref) ?? label(args.targetRef)
  const targetText = target ? `${target.role} "${clip(target.name)}"` : ''
  return {
    tool: 'act',
    tier: escalate(target?.name ?? '', 'write_external'),
    app: site,
    action: kind,
    navigatesTo: [],
    summary: `${kind === 'click' || kind === 'click_at' ? 'Click' : kind}${targetText ? ` ${targetText}` : ''}${where}`,
    details: args.value !== undefined ? [`value: ${clip(args.value)}`] : [],
  }
}

function classifyConnector(
  toolName: string,
  args: Record<string, unknown>,
): ClassifiedCall {
  const server =
    typeof args.server_name === 'string' ? args.server_name : undefined
  const action =
    typeof args.action_name === 'string' ? args.action_name : undefined
  const words = (action ?? '').replace(/[_-]+/g, ' ')
  // Action names often start with the app ("gmail_send_email"), so match words anywhere.
  // Risky words win over read words: "get_and_delete" is still a delete.
  let tier = /\bdraft\b/i.test(words)
    ? 'write_external'
    : escalate(words, 'write_external')
  if (
    tier === 'write_external' &&
    /\b(get|list|search|read|fetch|find|query|describe|lookup|retrieve)\b/i.test(
      words,
    )
  ) {
    tier = 'read'
  }

  const params =
    args.body_schema && typeof args.body_schema === 'object'
      ? (args.body_schema as Record<string, unknown>)
      : (args.query_params as Record<string, unknown> | undefined)
  return {
    tool: toolName,
    tier,
    app: server,
    action,
    navigatesTo: [],
    summary: `${action ?? 'Run an action'}${server ? ` in ${server}` : ''}`,
    details: params
      ? Object.entries(params)
          .slice(0, 12)
          .map(([key, value]) => `${key}: ${clip(value)}`)
      : [],
  }
}

type Base = Pick<ClassifiedCall, 'tool' | 'app' | 'navigatesTo'>
type Classifier = (
  base: Base,
  args: Record<string, unknown>,
  site: string | undefined,
) => ClassifiedCall

const str = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const classifyNavigate: Classifier = (base, args, site) => {
  const url = str(args.url)
  return {
    ...base,
    tier: 'read',
    action: str(args.action) ?? 'goto',
    navigatesTo: url ? [url] : [],
    summary: url ? `Open ${clip(url)}` : `Navigate${site ? ` on ${site}` : ''}`,
    details: [],
  }
}

const classifyTabLike: Classifier = (base, args) => {
  const action = str(args.action) ?? 'list'
  const url = str(args.url)
  return {
    ...base,
    tier: action === 'close' || action === 'remove' ? 'write_local' : 'read',
    action,
    navigatesTo: url ? [url] : [],
    summary: `${base.tool} ${action}${url ? ` ${clip(url)}` : ''}`,
    details: [],
  }
}

const classifyReadPages: Classifier = (base, args) => {
  const urls = Array.isArray(args.urls)
    ? args.urls.filter((u): u is string => typeof u === 'string')
    : []
  return {
    ...base,
    tier: 'read',
    navigatesTo: urls,
    summary: `Read ${urls.length} pages`,
    details: [],
  }
}

const classifyDownload: Classifier = (base, _args, site) => ({
  ...base,
  tier: 'write_local',
  summary: `Download a file${site ? ` from ${site}` : ''}`,
  details: [],
})

const classifyUpload: Classifier = (base, args, site) => ({
  ...base,
  tier: 'write_external',
  summary: `Upload ${clip(args.file ?? 'a file')}${site ? ` to ${site}` : ''}`,
  details: [],
})

// evaluate, run and anything unknown can change pages in arbitrary ways.
const classifyOther: Classifier = (base, args, site) => ({
  ...base,
  tier: 'write_external',
  summary: `${base.tool}${site ? ` on ${site}` : ''}`,
  details: typeof args.code === 'string' ? [`code: ${clip(args.code)}`] : [],
})

const CLASSIFIERS: Record<string, Classifier> = {
  navigate: classifyNavigate,
  tabs: classifyTabLike,
  windows: classifyTabLike,
  tab_groups: classifyTabLike,
  read_pages: classifyReadPages,
  download: classifyDownload,
  upload: classifyUpload,
}

/** Assigns a risk tier and a human-readable preview to one tool call. */
export function classifyCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ClassifyContext = {},
): ClassifiedCall {
  const site = hostOf(ctx.pageUrl)
  if (toolName === 'act') return classifyAct(args, ctx, site)
  if (toolName === 'execute_action') return classifyConnector(toolName, args)

  const base: Base = { tool: toolName, app: site, navigatesTo: [] }
  const classifier = CLASSIFIERS[toolName]
  if (classifier) return classifier(base, args, site)
  if (READ_TOOLS.has(toolName)) {
    return { ...base, tier: 'read', summary: toolName, details: [] }
  }
  return classifyOther(base, args, site)
}
