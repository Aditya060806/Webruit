/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto'
import type {
  ApprovalResponse,
  PendingApproval,
} from '@browseros/shared/schemas/permissions'

export const APPROVAL_TIMEOUT_MS = 5 * 60_000

type ApprovalInput = Omit<PendingApproval, 'id' | 'createdAt' | 'expiresAt'>

interface Waiter {
  approval: PendingApproval
  resolve: (response: ApprovalResponse) => void
}

type Listener = () => void

/**
 * Holds actions waiting for the user. A tool call awaits `request`; the
 * approval card answers through `respond`. Timeouts and stopped runs deny.
 */
export class ApprovalBroker {
  private readonly pending = new Map<string, Waiter>()
  private readonly listeners = new Set<Listener>()

  constructor(private readonly timeoutMs = APPROVAL_TIMEOUT_MS) {}

  list(): PendingApproval[] {
    return [...this.pending.values()].map((w) => w.approval)
  }

  request(
    input: ApprovalInput,
    signal?: AbortSignal,
  ): Promise<ApprovalResponse> {
    const now = Date.now()
    const approval: PendingApproval = {
      ...input,
      id: randomUUID(),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.timeoutMs).toISOString(),
    }
    const denied: ApprovalResponse = { decision: 'deny', scope: 'once' }
    if (signal?.aborted) return Promise.resolve(denied)

    return new Promise<ApprovalResponse>((resolve) => {
      const finish = (response: ApprovalResponse) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        if (this.pending.delete(approval.id)) this.notify()
        resolve(response)
      }
      const onAbort = () => finish(denied)
      const timer = setTimeout(() => finish(denied), this.timeoutMs)
      signal?.addEventListener('abort', onAbort, { once: true })
      this.pending.set(approval.id, { approval, resolve: finish })
      this.notify()
    })
  }

  /** Returns the approval it answered, or undefined if it already finished. */
  respond(id: string, response: ApprovalResponse): PendingApproval | undefined {
    const waiter = this.pending.get(id)
    if (!waiter) return undefined
    waiter.resolve(response)
    return waiter.approval
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}

/** One per server process: tool calls, routes and the panel stream share it. */
export const approvalBroker = new ApprovalBroker()
