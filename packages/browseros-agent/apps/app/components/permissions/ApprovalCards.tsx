/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type {
  ApprovalResponse,
  PendingApproval,
  RiskTier,
} from '@browseros/shared/schemas/permissions'
import { ShieldAlert } from 'lucide-react'
import { type FC, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { sentry } from '@/lib/sentry/sentry'
import {
  useAnswerApproval,
  usePendingApprovals,
} from '@/modules/permissions/permissions.hooks'

export const TIER_LABELS: Record<RiskTier, string> = {
  read: 'Read',
  write_local: 'Local change',
  write_external: 'Change on a site',
  send_message: 'Send',
  financial: 'Money',
  destructive: 'Delete',
  credential: 'Password',
}

const ApprovalCard: FC<{
  approval: PendingApproval
  onAnswer: (response: ApprovalResponse) => void
  busy: boolean
}> = ({ approval, onAnswer, busy }) => {
  const [reason, ...details] = approval.details
  return (
    <div className="rounded-xl border border-[#7C5CFF]/40 bg-[#7C5CFF]/5 p-3 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <ShieldAlert className="size-4 shrink-0 text-[#7C5CFF]" />
        <span className="font-semibold text-sm">Approve this action?</span>
        <Badge variant="secondary" className="ml-auto">
          {TIER_LABELS[approval.tier]}
        </Badge>
      </div>
      <p className="break-words text-sm">{approval.summary}</p>
      {details.length > 0 && (
        <ul className="mt-2 space-y-0.5 rounded-md bg-background/70 p-2 font-mono text-muted-foreground text-xs">
          {details.map((detail) => (
            <li key={detail} className="break-words">
              {detail}
            </li>
          ))}
        </ul>
      )}
      {reason && <p className="mt-2 text-muted-foreground text-xs">{reason}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => onAnswer({ decision: 'allow', scope: 'once' })}
        >
          Allow once
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onAnswer({ decision: 'allow', scope: 'run' })}
        >
          Allow for this chat
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onAnswer({ decision: 'allow', scope: 'always' })}
        >
          Always allow
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => onAnswer({ decision: 'deny', scope: 'once' })}
        >
          Deny
        </Button>
      </div>
    </div>
  )
}

/** Shows the current chat's waiting approvals above the composer. */
export const ApprovalCards: FC<{ conversationId: string | undefined }> = ({
  conversationId,
}) => {
  const approvals = usePendingApprovals(conversationId)
  const answer = useAnswerApproval()
  // Hide answered cards at once; the stream confirms a moment later.
  const [answered, setAnswered] = useState<Set<string>>(new Set())
  const visible = approvals.filter((approval) => !answered.has(approval.id))
  if (visible.length === 0) return null

  const respond = (approval: PendingApproval, response: ApprovalResponse) => {
    setAnswered((prev) => new Set(prev).add(approval.id))
    answer.mutate(
      { id: approval.id, ...response },
      {
        onError: (error) => {
          setAnswered((prev) => {
            const next = new Set(prev)
            next.delete(approval.id)
            return next
          })
          toast.error(error.message)
          sentry.captureException(error, {
            extra: { message: 'Failed to answer approval' },
          })
        },
      },
    )
  }

  return (
    <div className="space-y-2 px-3 pb-2">
      {visible.map((approval) => (
        <ApprovalCard
          key={approval.id}
          approval={approval}
          busy={answer.isPending}
          onAnswer={(response) => respond(approval, response)}
        />
      ))}
    </div>
  )
}
