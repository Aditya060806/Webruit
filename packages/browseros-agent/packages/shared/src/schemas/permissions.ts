/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod'
import { PermissionModeIdSchema } from './companion'

/** How much harm an action could do if it was wrong. Ordered from least to most. */
export const RiskTierSchema = z.enum([
  'read',
  'write_local',
  'write_external',
  'send_message',
  'financial',
  'destructive',
  'credential',
])

export const PolicyDecisionSchema = z.enum(['allow', 'ask', 'deny'])

/**
 * Default decision for every mode × tier. Credential entry by the agent is never
 * allowed, in any mode or by any rule.
 */
export const POLICY_MATRIX: Record<
  z.infer<typeof PermissionModeIdSchema>,
  Record<z.infer<typeof RiskTierSchema>, z.infer<typeof PolicyDecisionSchema>>
> = {
  ask_always: {
    read: 'allow',
    write_local: 'ask',
    write_external: 'ask',
    send_message: 'ask',
    financial: 'ask',
    destructive: 'ask',
    credential: 'deny',
  },
  balanced: {
    read: 'allow',
    write_local: 'allow',
    write_external: 'allow',
    send_message: 'ask',
    financial: 'ask',
    destructive: 'ask',
    credential: 'deny',
  },
  strict: {
    read: 'allow',
    write_local: 'ask',
    write_external: 'ask',
    send_message: 'ask',
    financial: 'deny',
    destructive: 'deny',
    credential: 'deny',
  },
  autopilot: {
    read: 'allow',
    write_local: 'allow',
    write_external: 'allow',
    send_message: 'allow',
    financial: 'allow',
    destructive: 'allow',
    credential: 'deny',
  },
}

/** A saved decision for one kind of action, keyed by tool + app + action. */
export const PermissionRuleSchema = z.object({
  id: z.string().min(1).max(64),
  tool: z.string().min(1).max(80),
  /** Connector server name, or the site's domain for browser actions. */
  app: z.string().max(200).optional(),
  /** Connector action name, or the act kind for browser actions. */
  action: z.string().max(200).optional(),
  tier: RiskTierSchema,
  decision: z.enum(['allow', 'deny']),
  label: z.string().max(200),
  createdAt: z.string(),
})

export const PermissionsConfigSchema = z.object({
  mode: PermissionModeIdSchema.default('balanced'),
  rules: z.array(PermissionRuleSchema).max(500).default([]),
})

/** An action waiting for the user, shown as an approval card. */
export const PendingApprovalSchema = z.object({
  id: z.string(),
  conversationId: z.string().optional(),
  tool: z.string(),
  tier: RiskTierSchema,
  /** One line, e.g. 'Click "Send" on mail.example.com'. */
  summary: z.string(),
  /** Exact values the action would use (recipient, text, amount), already truncated. */
  details: z.array(z.string()).max(12),
  app: z.string().optional(),
  action: z.string().optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
})

export const ApprovalResponseSchema = z.object({
  decision: z.enum(['allow', 'deny']),
  scope: z.enum(['once', 'run', 'always']).default('once'),
})

export type RiskTier = z.infer<typeof RiskTierSchema>
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>
export type PermissionRule = z.infer<typeof PermissionRuleSchema>
export type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>
export type PendingApproval = z.infer<typeof PendingApprovalSchema>
export type ApprovalResponse = z.infer<typeof ApprovalResponseSchema>
