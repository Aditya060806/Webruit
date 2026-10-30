/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { PermissionModeId } from '@browseros/shared/schemas/companion'
import {
  type PermissionRule,
  POLICY_MATRIX,
  type PolicyDecision,
} from '@browseros/shared/schemas/permissions'
import { type ClassifiedCall, hostOf } from './risk-tiers'

export interface SiteLimits {
  domainsAllow?: string[]
  domainsDeny?: string[]
}

export interface PolicyInput {
  call: ClassifiedCall
  mode: PermissionModeId
  rules: readonly PermissionRule[]
  /** Rule keys the user allowed for the rest of this run. */
  runAllowances: ReadonlySet<string>
  /** No one is watching (scheduled runs), so "ask" can't be answered. */
  unattended: boolean
  siteLimits?: SiteLimits
}

export interface PolicyResult {
  decision: PolicyDecision
  reason: string
}

/** The identity a saved or per-run approval applies to. */
export function ruleKey(call: Pick<ClassifiedCall, 'tool' | 'app' | 'action'>) {
  return [call.tool, call.app ?? '*', call.action ?? '*'].join('|')
}

function matchesDomain(host: string, pattern: string): boolean {
  const p = pattern
    .trim()
    .toLowerCase()
    .replace(/^\*\./, '')
    .replace(/^www\./, '')
  return host === p || host.endsWith(`.${p}`)
}

/** Most specific match wins: app+action, then app, then tool alone. */
function findRule(
  call: ClassifiedCall,
  rules: readonly PermissionRule[],
): PermissionRule | undefined {
  const candidates = rules.filter(
    (rule) =>
      rule.tool === call.tool &&
      (rule.app === undefined || rule.app === call.app) &&
      (rule.action === undefined || rule.action === call.action),
  )
  const score = (rule: PermissionRule) =>
    (rule.app ? 2 : 0) + (rule.action ? 1 : 0)
  return candidates.sort((a, b) => score(b) - score(a))[0]
}

function checkSites(
  urls: string[],
  limits: SiteLimits | undefined,
): PolicyResult | null {
  if (!limits || urls.length === 0) return null
  for (const url of urls) {
    const host = hostOf(url)
    if (!host) continue
    if (limits.domainsDeny?.some((d) => matchesDomain(host, d))) {
      return {
        decision: 'deny',
        reason: `${host} is on this companion's blocked sites.`,
      }
    }
    if (
      limits.domainsAllow?.length &&
      !limits.domainsAllow.some((d) => matchesDomain(host, d))
    ) {
      return {
        decision: 'ask',
        reason: `${host} isn't on this companion's allowed sites.`,
      }
    }
  }
  return null
}

/**
 * Decides one call. Order: credential entry (never), companion site limits,
 * saved rules, this-run approvals, then the mode × tier table. An "ask" with
 * no one watching becomes a deny.
 */
export function decide(input: PolicyInput): PolicyResult {
  const result = decideAttended(input)
  if (result.decision === 'ask' && input.unattended) {
    return {
      decision: 'deny',
      reason: `${result.reason} This run is unattended, so it can't ask. Add a rule in Settings › Permissions to allow it.`,
    }
  }
  return result
}

function decideAttended(input: PolicyInput): PolicyResult {
  const { call } = input
  if (call.tier === 'credential') {
    return {
      decision: 'deny',
      reason:
        'The agent never types passwords, card numbers or codes. Ask the user to enter it (use request_handoff).',
    }
  }

  const site = checkSites(call.navigatesTo, input.siteLimits)
  if (site?.decision === 'deny') return site

  const rule = findRule(call, input.rules)
  if (rule) {
    return {
      decision: rule.decision,
      reason: `Saved rule: ${rule.label}.`,
    }
  }
  if (input.runAllowances.has(ruleKey(call))) {
    return { decision: 'allow', reason: 'Allowed for this run.' }
  }
  if (site) return site

  const decision = POLICY_MATRIX[input.mode][call.tier]
  return {
    decision,
    reason:
      decision === 'deny'
        ? `${call.tier.replaceAll('_', ' ')} actions are blocked in ${input.mode.replaceAll('_', ' ')} mode.`
        : decision === 'ask'
          ? `${call.tier.replaceAll('_', ' ')} actions need approval in ${input.mode.replaceAll('_', ' ')} mode.`
          : 'Allowed by the current mode.',
  }
}
