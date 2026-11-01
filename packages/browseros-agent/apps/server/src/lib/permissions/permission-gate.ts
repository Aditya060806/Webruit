/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { PermissionModeId } from '@browseros/shared/schemas/companion'
import { logger } from '../logger'
import {
  type ApprovalBroker,
  type ApprovalOutcome,
  approvalBroker,
} from './approval-broker'
import { type PermissionsStore, permissionsStore } from './permissions-store'
import { decide, ruleKey, type SiteLimits } from './policy'
import { type ClassifyContext, classifyCall } from './risk-tiers'

export const PERMISSION_DENIED = 'PERMISSION_DENIED'

/** Per-conversation settings carried on the browser-tool lease. */
export interface LeasePermissions extends SiteLimits {
  /** Overrides the global mode for this companion. */
  permissionMode?: PermissionModeId
}

export interface GateContext extends ClassifyContext {
  conversationId?: string
  unattended: boolean
  permissions?: LeasePermissions
  signal?: AbortSignal
}

export type GateResult = { allowed: true } | { allowed: false; message: string }

const ALLOWED: GateResult = { allowed: true }

const DENIED_BY: Record<ApprovalOutcome['answeredBy'], string> = {
  user: 'the user declined',
  timeout: 'no one answered the approval request in time for',
  stopped: 'the run was stopped while waiting for approval of',
}

export class PermissionGate {
  /** conversationId → rule keys the user allowed "for this chat". */
  private readonly chatAllowances = new Map<string, Set<string>>()

  constructor(
    private readonly deps: {
      store: Pick<PermissionsStore, 'get' | 'addRule'>
      broker: Pick<ApprovalBroker, 'request'>
    } = { store: permissionsStore, broker: approvalBroker },
  ) {}

  async check(
    toolName: string,
    args: Record<string, unknown>,
    ctx: GateContext,
  ): Promise<GateResult> {
    const call = classifyCall(toolName, args, ctx)
    const config = await this.deps.store.get()
    const allowances = ctx.conversationId
      ? (this.chatAllowances.get(ctx.conversationId) ?? new Set<string>())
      : new Set<string>()
    const result = decide({
      call,
      mode: ctx.permissions?.permissionMode ?? config.mode,
      rules: config.rules,
      runAllowances: allowances,
      unattended: ctx.unattended,
      siteLimits: ctx.permissions,
    })

    if (result.decision === 'allow') return ALLOWED
    if (result.decision === 'deny') {
      logger.info('Tool call denied by policy', {
        tool: toolName,
        tier: call.tier,
        reason: result.reason,
      })
      return {
        allowed: false,
        message: `${PERMISSION_DENIED}: ${call.summary}. ${result.reason} Don't retry it; tell the user what you couldn't do.`,
      }
    }

    const response = await this.deps.broker.request(
      {
        conversationId: ctx.conversationId,
        tool: call.tool,
        tier: call.tier,
        summary: call.summary,
        details: [result.reason, ...call.details].slice(0, 12),
        app: call.app,
        action: call.action,
      },
      ctx.signal,
    )
    if (response.decision === 'deny') {
      return {
        allowed: false,
        message: `${PERMISSION_DENIED}: ${DENIED_BY[response.answeredBy]} "${call.summary}". Don't retry it. Ask in chat if you need another way.`,
      }
    }
    if (response.scope === 'run' && ctx.conversationId) {
      allowances.add(ruleKey(call))
      this.chatAllowances.set(ctx.conversationId, allowances)
    }
    if (response.scope === 'always') {
      await this.deps.store.addRule({
        tool: call.tool,
        app: call.app,
        action: call.action,
        tier: call.tier,
        decision: 'allow',
        label: `${call.action ?? call.tool} (${call.tier.replaceAll('_', ' ')} or lower)${call.app ? ` on ${call.app}` : ''}`,
      })
    }
    return ALLOWED
  }
}

/** One per server process. */
export const permissionGate = new PermissionGate()
