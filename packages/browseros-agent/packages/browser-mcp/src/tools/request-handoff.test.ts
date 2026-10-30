/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import type { BrowserSession } from '@browseros/browser-core/core/session'
import { executeTool } from './framework'
import { request_handoff } from './request-handoff'

const session = {
  pages: { getTabId: (page: number) => (page === 3 ? 303 : undefined) },
} as unknown as BrowserSession

describe('request_handoff', () => {
  it('returns the tab it hands over and tells the agent to end its turn', async () => {
    const result = await executeTool(
      request_handoff,
      { page: 3, reason: 'sign_in', message: 'Sign in to Acme' },
      { session },
    )
    expect(result.isError).toBeFalsy()
    expect(result.structuredContent).toEqual({
      page: 3,
      tabId: 303,
      reason: 'sign_in',
      message: 'Sign in to Acme',
    })
    const text = (result.content as { text?: string }[])[0]?.text ?? ''
    expect(text).toContain('End your turn')
  })

  it('rejects an unknown page', async () => {
    const result = await executeTool(
      request_handoff,
      { page: 9, reason: 'captcha', message: 'Solve it' },
      { session },
    )
    expect(result.isError).toBe(true)
  })

  it('rejects reasons outside the list', () => {
    expect(
      request_handoff.input.safeParse({
        page: 3,
        reason: 'pay',
        message: 'x',
      }).success,
    ).toBe(false)
  })
})
