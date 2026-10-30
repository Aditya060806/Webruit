/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import type { ConversationPanelAssignments } from '@browseros/shared/schemas/conversation-panels'
import { ConversationPanelBroker } from './conversationPanelBroker'

const snapshot: ConversationPanelAssignments = {
  assignments: [],
  controls: [
    {
      tabId: 7,
      control: {
        mode: 'user',
        reason: 'sign_in',
        since: '2026-10-30T00:00:00Z',
      },
    },
  ],
  approvals: [
    {
      id: '6b3c1f1e-2f6a-4c4e-9a53-2f1d2d3e4f50',
      conversationId: 'c1',
      tool: 'act',
      tier: 'send_message',
      summary: 'Click button "Send" on mail.example.com',
      details: ['send message actions need approval in balanced mode.'],
      createdAt: '2026-10-30T00:00:00Z',
      expiresAt: '2026-10-30T00:05:00Z',
    },
  ],
}

describe('ConversationPanelBroker (Webruit additions)', () => {
  it('forwards held tabs and waiting approvals from each stream message', async () => {
    const received: {
      controls?: unknown
      approvals?: unknown
    } = {}
    let broker: ConversationPanelBroker | undefined
    const done = new Promise<void>((resolve) => {
      broker = new ConversationPanelBroker({
        resolveServerUrl: async () => 'http://127.0.0.1:9505',
        fetch: async () =>
          new Response(`data: ${JSON.stringify(snapshot)}\n\n`, {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
        getTab: async (tabId) => ({ id: tabId, windowId: 1 }),
        openPanel: async () => {},
        readViews: async () => ({}),
        writeViews: async () => {},
        sendGlow: () => {},
        hasShownConfetti: async () => true,
        markConfettiShown: async () => {},
        applyTabControls: (controls) => {
          received.controls = controls
        },
        applyApprovals: (approvals) => {
          received.approvals = approvals
          resolve()
        },
        wait: async () => {
          broker?.stop()
        },
      })
    })
    void broker?.start()
    await done
    broker?.stop()

    expect(received.controls).toEqual(snapshot.controls)
    expect(received.approvals).toEqual(snapshot.approvals)
  })
})
