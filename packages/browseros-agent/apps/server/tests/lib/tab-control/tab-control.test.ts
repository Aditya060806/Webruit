/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import type { ConversationPanelAssignments } from '@browseros/shared/schemas/conversation-panels'
import { createTabControlRoutes } from '../../../src/api/routes/tab-control'
import { ConversationRuns } from '../../../src/api/services/conversation-runs'
import {
  guardUserControlCall,
  USER_HAS_CONTROL,
} from '../../../src/api/services/mcp/guards/user-control'
import { TabControlRegistry } from '../../../src/lib/tab-control/tab-control-registry'

const tabForPage = (page: number) => ({ 1: 101, 2: 102 })[page]

function textOf(result: { content?: unknown } | null): string {
  return ((result?.content ?? []) as { text?: string }[])
    .map((item) => item.text ?? '')
    .join('\n')
}

describe('TabControlRegistry', () => {
  it('takes over and hands back a tab, notifying listeners each time', () => {
    const registry = new TabControlRegistry()
    let changes = 0
    registry.onChange(() => changes++)

    const control = registry.takeOver(101, {
      reason: 'sign_in',
      message: 'Sign in to Acme',
      conversationId: 'c1',
    })
    expect(control).toMatchObject({ mode: 'user', reason: 'sign_in' })
    expect(registry.get(101)?.conversationId).toBe('c1')

    expect(registry.handBack(101)?.reason).toBe('sign_in')
    expect(registry.get(101)).toBeUndefined()
    expect(registry.handBack(101)).toBeUndefined()
    expect(changes).toBe(2)
  })

  it('keeps the waiting conversation when the user takes over a handed-off tab', () => {
    const registry = new TabControlRegistry()
    registry.takeOver(101, { reason: 'captcha', conversationId: 'c1' })
    registry.takeOver(101, { reason: 'take_over' })
    expect(registry.get(101)).toMatchObject({
      reason: 'take_over',
      conversationId: 'c1',
    })
  })
})

describe('user-control guard', () => {
  it('blocks every tool aimed at a held tab, reads included', () => {
    const registry = new TabControlRegistry()
    registry.takeOver(101, { reason: 'take_over' })

    for (const tool of ['act', 'snapshot', 'read', 'navigate', 'screenshot']) {
      const result = guardUserControlCall(
        registry,
        tool,
        { page: 1 },
        tabForPage,
      )
      expect(result?.isError).toBe(true)
      expect(textOf(result)).toContain(USER_HAS_CONTROL)
    }
  })

  it('leaves other tabs, tab listing and request_handoff alone', () => {
    const registry = new TabControlRegistry()
    registry.takeOver(101, { reason: 'take_over' })

    expect(
      guardUserControlCall(registry, 'act', { page: 2 }, tabForPage),
    ).toBeNull()
    expect(
      guardUserControlCall(registry, 'tabs', { action: 'list' }, tabForPage),
    ).toBeNull()
    expect(
      guardUserControlCall(
        registry,
        'request_handoff',
        { page: 1 },
        tabForPage,
      ),
    ).toBeNull()
  })

  it('blocks run while any tab is held, since it can reach any page', () => {
    const registry = new TabControlRegistry()
    expect(guardUserControlCall(registry, 'run', {}, tabForPage)).toBeNull()
    registry.takeOver(102, { reason: 'sign_in' })
    expect(
      textOf(guardUserControlCall(registry, 'run', {}, tabForPage)),
    ).toContain(USER_HAS_CONTROL)
  })
})

describe('panel stream', () => {
  async function firstAssignments(
    runs: ConversationRuns,
  ): Promise<ConversationPanelAssignments> {
    const reader = runs.subscribePanelAssignments().getReader()
    const { value } = await reader.read()
    await reader.cancel()
    if (!value) throw new Error('no assignments')
    return value
  }

  it('publishes held tabs and omits the field when none are held', async () => {
    const registry = new TabControlRegistry()
    const runs = new ConversationRuns({ tabControl: registry })

    expect(await firstAssignments(runs)).toEqual({ assignments: [] })

    registry.takeOver(101, { reason: 'captcha', message: 'Solve it' })
    const withControl = await firstAssignments(runs)
    expect(withControl.controls).toEqual([
      {
        tabId: 101,
        control: expect.objectContaining({
          mode: 'user',
          reason: 'captcha',
          message: 'Solve it',
        }),
      },
    ])
  })

  it('pushes a fresh table to subscribers as soon as control changes', async () => {
    const registry = new TabControlRegistry()
    const runs = new ConversationRuns({
      tabControl: registry,
      panelAssignmentsHeartbeatMs: 60_000,
    })
    const reader = runs.subscribePanelAssignments().getReader()
    await reader.read()

    registry.takeOver(101, { reason: 'take_over' })
    const { value } = await reader.read()
    expect(value?.controls?.[0]?.tabId).toBe(101)
    await reader.cancel()
  })

  it('releases control when the tab closes', () => {
    const registry = new TabControlRegistry()
    const runs = new ConversationRuns({ tabControl: registry })
    registry.takeOver(101, { reason: 'take_over' })
    runs.removePanelTab(101)
    expect(registry.get(101)).toBeUndefined()
  })
})

describe('tab-control routes', () => {
  it('takes over and hands back through HTTP', async () => {
    const registry = new TabControlRegistry()
    const app = createTabControlRoutes({ registry })

    const takeOver = await app.request('/101/take-over', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: 'c1' }),
    })
    expect(takeOver.status).toBe(200)
    expect(registry.get(101)).toMatchObject({
      reason: 'take_over',
      conversationId: 'c1',
    })

    const list = (await (await app.request('/')).json()) as {
      tabs: unknown[]
    }
    expect(list.tabs).toHaveLength(1)

    const handBack = await app.request('/101/hand-back', { method: 'POST' })
    const body = (await handBack.json()) as {
      released: { conversationId?: string } | null
    }
    expect(body.released?.conversationId).toBe('c1')
    expect(registry.get(101)).toBeUndefined()
  })

  it('rejects a non-numeric tab id', async () => {
    const app = createTabControlRoutes({ registry: new TabControlRegistry() })
    const response = await app.request('/abc/hand-back', { method: 'POST' })
    expect(response.status).toBe(400)
  })
})
