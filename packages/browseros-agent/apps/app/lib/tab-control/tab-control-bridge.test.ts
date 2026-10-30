/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import type { TabControl } from '@browseros/shared/schemas/conversation-panels'
import { TabControlBridge, type TabControlMessage } from './tab-control-bridge'

const held = (reason: TabControl['reason']): TabControl => ({
  mode: 'user',
  reason,
  since: '2026-10-30T00:00:00.000Z',
})

function bridgeWithLog(
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>,
) {
  const sent: Array<{ tabId: number; message: TabControlMessage }> = []
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const bridge = new TabControlBridge({
    resolveServerUrl: async () => 'http://127.0.0.1:9505',
    fetch: async (url, init) => {
      requests.push({ url, init })
      return fetchImpl
        ? fetchImpl(url, init)
        : new Response(JSON.stringify({ released: null }))
    },
    sendToTab: (tabId, message) => sent.push({ tabId, message }),
  })
  return { bridge, sent, requests }
}

describe('TabControlBridge', () => {
  it('messages only tabs whose holder changed, including released tabs', () => {
    const { bridge, sent } = bridgeWithLog()

    bridge.apply([{ tabId: 1, control: held('take_over') }])
    bridge.apply([{ tabId: 1, control: held('take_over') }])
    expect(sent).toHaveLength(1)

    bridge.apply([{ tabId: 2, control: held('sign_in') }])
    expect(sent.slice(1)).toEqual([
      {
        tabId: 2,
        message: { type: 'webruit.tabControl', control: held('sign_in') },
      },
      { tabId: 1, message: { type: 'webruit.tabControl', control: null } },
    ])
    expect(bridge.get(1)).toBeNull()
    expect(bridge.get(2)?.reason).toBe('sign_in')
  })

  it('posts take-over and hand-back to the server and returns the released control', async () => {
    const { bridge, requests } = bridgeWithLog(
      async () =>
        new Response(
          JSON.stringify({
            released: { ...held('captcha'), conversationId: 'c1' },
          }),
        ),
    )
    await bridge.takeOver(7, 'c1')
    const released = await bridge.handBack(7)

    expect(requests.map((r) => r.url)).toEqual([
      'http://127.0.0.1:9505/tab-control/7/take-over',
      'http://127.0.0.1:9505/tab-control/7/hand-back',
    ])
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      conversationId: 'c1',
    })
    expect(released?.conversationId).toBe('c1')
  })

  it('throws when the server refuses', async () => {
    const { bridge } = bridgeWithLog(
      async () => new Response('nope', { status: 500 }),
    )
    await expect(bridge.takeOver(7)).rejects.toThrow('500')
  })
})
