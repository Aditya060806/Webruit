/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { TabControl } from '@browseros/shared/schemas/conversation-panels'

export const TAB_CONTROL_MESSAGE_TYPE = 'webruit.tabControl'

/** Background → content script: the tab's current holder. `control: null` means the agent may act. */
export interface TabControlMessage {
  type: typeof TAB_CONTROL_MESSAGE_TYPE
  control: TabControl | null
}

export interface TabControlBridgeDeps {
  resolveServerUrl(): Promise<string>
  fetch(input: string, init?: RequestInit): Promise<Response>
  sendToTab(tabId: number, message: TabControlMessage): void
}

/**
 * Mirrors the server's user-held tabs into page overlays. The server is the
 * authority: take-over and hand-back go there, and the next panel-stream
 * message (sent immediately on change) is what updates the overlays.
 */
export class TabControlBridge {
  private controls = new Map<number, TabControl>()

  constructor(private readonly deps: TabControlBridgeDeps) {}

  get(tabId: number): TabControl | null {
    return this.controls.get(tabId) ?? null
  }

  /** Applies one complete snapshot; only tabs whose holder changed are messaged. */
  apply(snapshot: ReadonlyArray<{ tabId: number; control: TabControl }>): void {
    const next = new Map(snapshot.map((entry) => [entry.tabId, entry.control]))
    const changed = new Set<number>()
    for (const [tabId, control] of next) {
      if (JSON.stringify(this.controls.get(tabId)) !== JSON.stringify(control))
        changed.add(tabId)
    }
    for (const tabId of this.controls.keys()) {
      if (!next.has(tabId)) changed.add(tabId)
    }
    this.controls = next
    for (const tabId of changed) {
      this.deps.sendToTab(tabId, {
        type: TAB_CONTROL_MESSAGE_TYPE,
        control: next.get(tabId) ?? null,
      })
    }
  }

  async takeOver(tabId: number, conversationId?: string): Promise<void> {
    await this.post(`${tabId}/take-over`, { conversationId })
  }

  /** Returns the conversation that was waiting on this tab, if any. */
  async handBack(tabId: number): Promise<TabControl | null> {
    const body = (await this.post(`${tabId}/hand-back`)) as {
      released?: TabControl | null
    }
    return body.released ?? null
  }

  private async post(path: string, body?: unknown): Promise<unknown> {
    const serverUrl = await this.deps.resolveServerUrl()
    const response = await this.deps.fetch(`${serverUrl}/tab-control/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    if (!response.ok) {
      throw new Error(`Tab control request failed (${response.status})`)
    }
    return await response.json()
  }
}
