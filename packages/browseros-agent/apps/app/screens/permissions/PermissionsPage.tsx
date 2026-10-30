/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { PermissionModeId } from '@browseros/shared/schemas/companion'
import {
  POLICY_MATRIX,
  type PolicyDecision,
  type RiskTier,
  RiskTierSchema,
} from '@browseros/shared/schemas/permissions'
import { Trash2 } from 'lucide-react'
import type { FC } from 'react'
import { toast } from 'sonner'
import { TIER_LABELS } from '@/components/permissions/ApprovalCards'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useDeleteRule,
  usePermissions,
  useSetPermissionMode,
  useUpdateRule,
} from '@/modules/permissions/permissions.hooks'

const MODES: Array<{ id: PermissionModeId; name: string; detail: string }> = [
  {
    id: 'balanced',
    name: 'Balanced',
    detail:
      'Reads and ordinary clicks run freely. Sending, paying and deleting ask first.',
  },
  {
    id: 'ask_always',
    name: 'Ask every time',
    detail: 'Anything beyond reading asks first.',
  },
  {
    id: 'strict',
    name: 'Strict',
    detail:
      'Changes ask first. Paying and deleting are blocked unless you add a rule.',
  },
  {
    id: 'autopilot',
    name: 'Autopilot',
    detail:
      'Nothing asks. Use only for tasks you trust; scheduled runs follow it too.',
  },
]

const DECISION_STYLE: Record<PolicyDecision, string> = {
  allow: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  ask: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  deny: 'bg-red-500/10 text-red-700 dark:text-red-400',
}

const DECISION_LABEL: Record<PolicyDecision, string> = {
  allow: 'Runs',
  ask: 'Asks',
  deny: 'Blocked',
}

const TIERS: RiskTier[] = RiskTierSchema.options

export const PermissionsPage: FC = () => {
  const { config, loading, error } = usePermissions()
  const setMode = useSetPermissionMode()
  const updateRule = useUpdateRule()
  const deleteRule = useDeleteRule()

  const onError = (err: Error) => toast.error(err.message)

  if (error) {
    return (
      <p className="text-destructive text-sm">
        Couldn't load permissions: {error.message}
      </p>
    )
  }
  if (loading || !config) {
    return <p className="text-muted-foreground text-sm">Loading…</p>
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-semibold text-xl">Permissions</h2>
        <p className="text-muted-foreground text-sm">
          Choose what the agent may do without asking. The agent never types
          passwords, card numbers or codes, in any mode. A companion can set its
          own mode, which overrides this one.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="font-semibold text-base">Mode</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              disabled={setMode.isPending}
              onClick={() => setMode.mutate(mode.id, { onError })}
              className={cn(
                'rounded-xl border p-3 text-left transition-colors hover:bg-muted/50',
                config.mode === mode.id &&
                  'border-[#7C5CFF] bg-[#7C5CFF]/5 ring-1 ring-[#7C5CFF]',
              )}
              aria-pressed={config.mode === mode.id}
            >
              <div className="font-medium text-sm">{mode.name}</div>
              <div className="text-muted-foreground text-xs">{mode.detail}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-base">What each mode does</h3>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-2 font-medium">Action</th>
                {MODES.map((mode) => (
                  <th
                    key={mode.id}
                    className={cn(
                      'p-2 font-medium',
                      config.mode === mode.id && 'text-[#7C5CFF]',
                    )}
                  >
                    {mode.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIERS.map((tier) => (
                <tr key={tier} className="border-b last:border-0">
                  <td className="p-2">{TIER_LABELS[tier]}</td>
                  {MODES.map((mode) => {
                    const decision = POLICY_MATRIX[mode.id][tier]
                    return (
                      <td key={mode.id} className="p-2">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs',
                            DECISION_STYLE[decision],
                          )}
                        >
                          {DECISION_LABEL[decision]}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground text-xs">
          Scheduled tasks run with no one to ask, so anything that would ask is
          blocked unless a rule below allows it.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-base">Saved rules</h3>
        {config.rules.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No rules yet. Choose "Always allow" on an approval to add one.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {config.rules.map((rule) => (
              <li key={rule.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-sm">
                    {rule.label}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {TIER_LABELS[rule.tier]} · {rule.tool}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updateRule.isPending}
                  onClick={() =>
                    updateRule.mutate(
                      {
                        id: rule.id,
                        decision: rule.decision === 'allow' ? 'deny' : 'allow',
                      },
                      { onError },
                    )
                  }
                  title="Switch between allow and block"
                >
                  {rule.decision === 'allow' ? 'Allowed' : 'Blocked'}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={deleteRule.isPending}
                  onClick={() => deleteRule.mutate(rule.id, { onError })}
                  aria-label={`Delete rule ${rule.label}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
