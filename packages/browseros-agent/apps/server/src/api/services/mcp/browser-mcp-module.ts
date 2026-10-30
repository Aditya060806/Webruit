/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { BrowserSession } from '@browseros/browser-core/core/session'
import { createBrowserMcpServer } from '@browseros/browser-mcp/mcp-server'
import type { BrowserOutputFileAccess } from '@browseros/browser-mcp/output-file'
import { BROWSER_TOOLS } from '@browseros/browser-mcp/registry'
import {
  errorResult,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from '@browseros/browser-mcp/tools/framework'
import { tabs } from '@browseros/browser-mcp/tools/tabs'
import type { BrowserContext } from '@browseros/shared/schemas/browser-context'
import { z } from 'zod/v4'
import { logger } from '../../../lib/logger'
import {
  type LeasePermissions,
  type PermissionGate,
  permissionGate,
} from '../../../lib/permissions/permission-gate'
import { shouldLogToolRegistration } from '../../../tools/registration-log-sampling'
import type { ConversationRuns } from '../conversation-runs'
import type { KlavisService } from '../klavis'
import type { ServerActivity } from '../server-activity'
import {
  type BrowserToolCall,
  dispatchBrowserTool,
} from './browser-tool-dispatch'
import { ConversationTabGroups } from './conversation-tab-groups'
import { MCP_INSTRUCTIONS } from './mcp-prompt'

export { BROWSEROS_TOOL_LEASE_HEADER } from '../../../lib/browser-tool-lease'

export interface BrowserMcpModuleDeps {
  version: string
  browserSession: BrowserSession
  conversationRuns: Pick<ConversationRuns, 'activeRun'>
  klavis?: KlavisService
  activity?: ServerActivity
  tabGroups?: Pick<ConversationTabGroups, 'addCreatedPages'>
  permissionGate?: Pick<PermissionGate, 'check'>
}

export interface BrowserToolLeaseInput {
  conversationId: string
  readOnly: boolean
  outputFileAccess: BrowserOutputFileAccess
  browserContext?: BrowserContext
  source?: string
  /** Webruit: companion permission mode and site limits for this conversation. */
  permissions?: LeasePermissions
}

/**
 * Durable capability for one conversation. Run authority is deliberately not
 * stored here; each MCP call resolves and pins the canonical active run.
 */
export interface BrowserToolLease {
  readonly token: string
  updateBrowserContext(browserContext: BrowserContext | undefined): void
  revoke(): void
}

export interface CreateBrowserMcpServerInput {
  leaseToken?: string
  requestedReadOnly?: boolean
  includeStructuredContent?: boolean
}

interface LeaseRecord extends BrowserToolLeaseInput {
  token: string
}

const readOnlyTabs: ToolDefinition = {
  ...tabs,
  description:
    'Inspect browser tabs. `list` returns every open page and `active` returns the front page. Read-only mode cannot open or close tabs.',
  input: z
    .object({ action: z.enum(['list', 'active']).default('list') })
    .strict(),
  annotations: {
    ...tabs.annotations,
    readOnlyHint: true,
    destructiveHint: false,
  },
}

const READ_ONLY_BROWSER_TOOLS: readonly ToolDefinition[] = [
  readOnlyTabs,
  ...BROWSER_TOOLS.filter(
    (tool) => tool.name !== 'tabs' && tool.annotations?.readOnlyHint,
  ),
]

/** Page facts only refine the risk preview; a missing one must never block the call. */
function safely<T>(read: () => T): T | undefined {
  try {
    return read()
  } catch {
    return undefined
  }
}

export class InvalidBrowserToolLeaseError extends Error {
  constructor() {
    super('Invalid or expired BrowserOS tool lease')
    this.name = 'InvalidBrowserToolLeaseError'
  }
}

/**
 * Deep server module behind `/mcp`: it owns leases, catalogue policy, ordered
 * dispatch, output grants, panel effects, and tab grouping. HTTP remains a thin
 * protocol adapter and both native and ACP agents use this one production path.
 */
export class BrowserMcpModule {
  private readonly leases = new Map<string, LeaseRecord>()
  private readonly tabGroups: Pick<ConversationTabGroups, 'addCreatedPages'>
  private readonly permissionGate: Pick<PermissionGate, 'check'>

  constructor(private readonly deps: BrowserMcpModuleDeps) {
    this.tabGroups =
      deps.tabGroups ?? new ConversationTabGroups(deps.browserSession)
    this.permissionGate = deps.permissionGate ?? permissionGate
  }

  createLease(input: BrowserToolLeaseInput): BrowserToolLease {
    const record: LeaseRecord = { ...input, token: crypto.randomUUID() }
    this.leases.set(record.token, record)
    return {
      token: record.token,
      updateBrowserContext: (browserContext) => {
        if (this.leases.get(record.token) === record) {
          record.browserContext = browserContext
        }
      },
      // Revocation prevents new transports from recovering this capability.
      // Existing request-scoped servers keep their captured scope; the active
      // conversation guard remains their execution authority.
      revoke: () => {
        if (this.leases.get(record.token) === record) {
          this.leases.delete(record.token)
        }
      },
    }
  }

  /** Validates transport admission; tool dispatch never rechecks this token. */
  validateLeaseToken(token: string): void {
    if (!this.leases.has(token)) throw new InvalidBrowserToolLeaseError()
  }

  createMcpServer(input: CreateBrowserMcpServerInput = {}) {
    const lease = input.leaseToken
      ? this.leases.get(input.leaseToken)
      : undefined
    if (input.leaseToken && !lease) throw new InvalidBrowserToolLeaseError()

    // The query may further restrict a caller but can never weaken a lease.
    const readOnly = Boolean(lease?.readOnly || input.requestedReadOnly)
    const source = lease?.source ?? 'mcp'
    const tools = readOnly ? READ_ONLY_BROWSER_TOOLS : BROWSER_TOOLS
    const selectedServerNames = lease?.browserContext?.enabledMcpServers ?? []

    const server = createBrowserMcpServer({
      name: 'browseros_mcp',
      title: 'Webruit MCP server',
      version: this.deps.version,
      browserSession: this.deps.browserSession,
      defaultWindowId: lease?.browserContext?.windowId,
      instructions: MCP_INSTRUCTIONS,
      registration: {
        tools,
        includeStructuredContent: input.includeStructuredContent ?? false,
        sessionIdentity: !lease,
        executor: (tool, args, context) =>
          this.execute(lease, readOnly, source, tool, args, context),
        logger,
        onToolExecutionStart: () => this.deps.activity?.beginMcpToolExecution(),
        onToolExecutionEnd: () => this.deps.activity?.endMcpToolExecution(),
        shouldLogToolRegistration,
        source,
      },
    })

    this.deps.klavis?.registerMcpTools(
      server,
      { selectedServerNames },
      {
        // Managed connectors bypass the browser executor, so repeat the two
        // endpoint-wide guards at that protocol seam.
        authorizeCall: () => {
          if (
            lease &&
            !this.deps.conversationRuns.activeRun(lease.conversationId)
          ) {
            return 'MCP tools require an active conversation run.'
          }
          if (readOnly) {
            return 'Managed connector tools are unavailable in read-only mode.'
          }
          return undefined
        },
        authorizeToolCall: (toolName, args) =>
          this.authorizeConnectorCall(lease, toolName, args),
      },
    )
    return server
  }

  private async execute(
    lease: LeaseRecord | undefined,
    readOnly: boolean,
    source: string,
    tool: ToolDefinition,
    args: Record<string, unknown>,
    context: ToolContext,
  ) {
    // Resolve once and carry this exact handle through execution. If another
    // turn starts before effects run, its record-identity check rejects them.
    const run = lease
      ? this.deps.conversationRuns.activeRun(lease.conversationId)
      : undefined
    return await dispatchBrowserTool({
      tool,
      args,
      context,
      lease,
      run,
      readOnly,
      source,
      tabGroups: this.tabGroups,
      // External MCP clients (no lease) are the user's own agents; the policy covers Webruit's.
      authorize: lease
        ? (call) => this.authorizeBrowserCall(lease, call)
        : undefined,
    })
  }

  private async authorizeBrowserCall(
    lease: LeaseRecord,
    call: BrowserToolCall,
  ): Promise<ToolResult | null> {
    const page = typeof call.args.page === 'number' ? call.args.page : undefined
    const session = call.context.session
    const result = await this.permissionGate.check(call.tool.name, call.args, {
      conversationId: lease.conversationId,
      unattended: call.run ? !call.run.panelsVisible : false,
      permissions: lease.permissions,
      signal: call.run?.signal,
      pageUrl:
        page === undefined
          ? undefined
          : safely(() => session.pages.getInfo(page)?.url),
      refLabel:
        page === undefined
          ? undefined
          : (ref) => safely(() => session.observe(page).lastRefs.get(ref)),
    })
    return result.allowed ? null : errorResult(result.message)
  }

  /** Strata connector calls skip the browser pipeline, so they get the same check here. */
  private async authorizeConnectorCall(
    lease: LeaseRecord | undefined,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string | undefined> {
    if (!lease) return undefined
    const run = this.deps.conversationRuns.activeRun(lease.conversationId)
    const result = await this.permissionGate.check(toolName, args, {
      conversationId: lease.conversationId,
      unattended: run ? !run.panelsVisible : false,
      permissions: lease.permissions,
      signal: run?.signal,
    })
    return result.allowed ? undefined : result.message
  }
}
