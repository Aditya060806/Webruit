/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type {
  TabControl,
  TabControlReason,
} from '@browseros/shared/schemas/conversation-panels'

export interface TakeOverInput {
  reason: TabControlReason
  message?: string
  conversationId?: string
}

type Listener = () => void

/**
 * Which tabs the user is driving. Absent means the agent may act. Updates are
 * synchronous so a tool call that starts after take-over is always blocked.
 */
export class TabControlRegistry {
  private readonly byTab = new Map<number, TabControl>()
  private readonly listeners = new Set<Listener>()

  get(tabId: number): TabControl | undefined {
    return this.byTab.get(tabId)
  }

  hasUserControlledTabs(): boolean {
    return this.byTab.size > 0
  }

  list(): Array<{ tabId: number; control: TabControl }> {
    return [...this.byTab.entries()].map(([tabId, control]) => ({
      tabId,
      control,
    }))
  }

  takeOver(tabId: number, input: TakeOverInput): TabControl {
    const existing = this.byTab.get(tabId)
    const control: TabControl = {
      mode: 'user',
      reason: input.reason,
      ...(input.message && { message: input.message.slice(0, 300) }),
      ...((input.conversationId ?? existing?.conversationId) && {
        conversationId: input.conversationId ?? existing?.conversationId,
      }),
      since: existing?.since ?? new Date().toISOString(),
    }
    this.byTab.set(tabId, control)
    this.notify()
    return control
  }

  /** Returns the released control, or undefined if the agent already had the tab. */
  handBack(tabId: number): TabControl | undefined {
    const control = this.byTab.get(tabId)
    if (!control) return undefined
    this.byTab.delete(tabId)
    this.notify()
    return control
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}

/** One per server process: guards, routes and the panel stream must agree. */
export const tabControl = new TabControlRegistry()
