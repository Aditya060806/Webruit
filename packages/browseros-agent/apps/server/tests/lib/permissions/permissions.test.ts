/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PermissionRule } from '@browseros/shared/schemas/permissions'
import { createPermissionsRoutes } from '../../../src/api/routes/permissions'
import { ApprovalBroker } from '../../../src/lib/permissions/approval-broker'
import {
  PERMISSION_DENIED,
  PermissionGate,
} from '../../../src/lib/permissions/permission-gate'
import { PermissionsStore } from '../../../src/lib/permissions/permissions-store'
import { decide, ruleKey } from '../../../src/lib/permissions/policy'
import { classifyCall } from '../../../src/lib/permissions/risk-tiers'

const labels: Record<string, { role: string; name: string }> = {
  e1: { role: 'button', name: 'Send' },
  e2: { role: 'button', name: 'Place order' },
  e3: { role: 'button', name: 'Delete conversation' },
  e4: { role: 'link', name: 'Pricing' },
  e5: { role: 'textbox', name: 'Password' },
  e6: { role: 'textbox', name: 'Subject' },
}
const ctx = {
  pageUrl: 'https://mail.example.com/inbox',
  refLabel: (ref: string) => labels[ref],
}

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'webruit-permissions-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('classifyCall', () => {
  it('raises clicks by what the button says', () => {
    const tier = (ref: string) =>
      classifyCall('act', { page: 1, kind: 'click', ref }, ctx).tier
    expect(tier('e1')).toBe('send_message')
    expect(tier('e2')).toBe('financial')
    expect(tier('e3')).toBe('destructive')
    expect(tier('e4')).toBe('write_external')
  })

  it('treats typing into a password field as credential entry and hides the value', () => {
    const call = classifyCall(
      'act',
      {
        page: 1,
        kind: 'fill',
        fields: [
          { ref: 'e6', value: 'Hello' },
          { ref: 'e5', value: 'hunter2' },
        ],
      },
      ctx,
    )
    expect(call.tier).toBe('credential')
    expect(call.details).toEqual(['Subject: Hello', 'Password: (hidden)'])
    expect(JSON.stringify(call)).not.toContain('hunter2')
  })

  it('classifies connector actions by name', () => {
    const tier = (action_name: string) =>
      classifyCall('execute_action', { server_name: 'Gmail', action_name }).tier
    expect(tier('gmail_list_messages')).toBe('read')
    expect(tier('gmail_send_email')).toBe('send_message')
    expect(tier('gmail_create_draft')).toBe('write_external')
    expect(tier('gmail_delete_message')).toBe('destructive')
    expect(tier('get_action_details')).toBe('read')
  })

  it('reads stay read, and navigation records where it goes', () => {
    expect(classifyCall('snapshot', { page: 1 }, ctx).tier).toBe('read')
    const nav = classifyCall('navigate', {
      page: 1,
      action: 'goto',
      url: 'https://shop.example.com',
    })
    expect(nav.tier).toBe('read')
    expect(nav.navigatesTo).toEqual(['https://shop.example.com'])
  })
})

describe('decide', () => {
  const send = classifyCall('act', { page: 1, kind: 'click', ref: 'e1' }, ctx)
  const base = {
    call: send,
    mode: 'balanced' as const,
    rules: [] as PermissionRule[],
    runAllowances: new Set<string>(),
    unattended: false,
  }

  it('asks to send in balanced mode, and denies instead when unattended', () => {
    expect(decide(base).decision).toBe('ask')
    const unattended = decide({ ...base, unattended: true })
    expect(unattended.decision).toBe('deny')
    expect(unattended.reason).toContain('Settings › Permissions')
  })

  it('lets a saved rule allow an unattended send', () => {
    const rule: PermissionRule = {
      id: 'r1',
      tool: 'act',
      app: 'mail.example.com',
      action: 'click',
      tier: 'send_message',
      decision: 'allow',
      label: 'click on mail.example.com',
      createdAt: '2026-10-30T00:00:00.000Z',
    }
    expect(decide({ ...base, unattended: true, rules: [rule] }).decision).toBe(
      'allow',
    )
  })

  it('never allows credential entry, even in autopilot or with a rule', () => {
    const typing = classifyCall(
      'act',
      { page: 1, kind: 'fill', ref: 'e5', value: 'x' },
      ctx,
    )
    const rule: PermissionRule = {
      id: 'r2',
      tool: 'act',
      tier: 'credential',
      decision: 'allow',
      label: 'any',
      createdAt: '2026-10-30T00:00:00.000Z',
    }
    expect(
      decide({ ...base, call: typing, mode: 'autopilot', rules: [rule] })
        .decision,
    ).toBe('deny')
  })

  it('follows the mode table', () => {
    const click = classifyCall(
      'act',
      { page: 1, kind: 'click', ref: 'e4' },
      ctx,
    )
    expect(decide({ ...base, call: click }).decision).toBe('allow')
    expect(decide({ ...base, call: click, mode: 'strict' }).decision).toBe(
      'ask',
    )
    expect(decide({ ...base, mode: 'autopilot' }).decision).toBe('allow')
  })

  it('honours this-chat approvals', () => {
    expect(
      decide({ ...base, runAllowances: new Set([ruleKey(send)]) }).decision,
    ).toBe('allow')
  })

  it("enforces the companion's site limits on navigation", () => {
    const goto = (url: string) =>
      classifyCall('navigate', { page: 1, action: 'goto', url })
    const limits = {
      domainsAllow: ['docs.google.com'],
      domainsDeny: ['facebook.com'],
    }
    expect(
      decide({
        ...base,
        call: goto('https://m.facebook.com/x'),
        siteLimits: limits,
      }).decision,
    ).toBe('deny')
    expect(
      decide({
        ...base,
        call: goto('https://docs.google.com/a'),
        siteLimits: limits,
      }).decision,
    ).toBe('allow')
    expect(
      decide({ ...base, call: goto('https://example.org'), siteLimits: limits })
        .decision,
    ).toBe('ask')
  })
})

describe('PermissionsStore', () => {
  it('defaults to balanced, saves mode and rules to disk, and replaces duplicate rules', async () => {
    const file = join(root, 'permissions.json')
    const store = new PermissionsStore(file)
    expect((await store.get()).mode).toBe('balanced')

    await store.setMode('strict')
    const input = {
      tool: 'execute_action',
      app: 'Gmail',
      action: 'gmail_send_email',
      tier: 'send_message' as const,
      decision: 'allow' as const,
      label: 'Send email in Gmail',
    }
    await store.addRule(input)
    const second = await store.addRule({ ...input, decision: 'deny' })

    const saved = JSON.parse(await readFile(file, 'utf8'))
    expect(saved.mode).toBe('strict')
    expect(saved.rules).toHaveLength(1)
    expect(saved.rules[0].decision).toBe('deny')

    expect(await store.deleteRule(second.id)).toBe(true)
    expect((await new PermissionsStore(file).get()).rules).toEqual([])
  })
})

describe('ApprovalBroker', () => {
  it('resolves with the answer and drops the request', async () => {
    const broker = new ApprovalBroker()
    let changes = 0
    broker.onChange(() => changes++)
    const pending = broker.request({
      tool: 'act',
      tier: 'send_message',
      summary: 'Click "Send"',
      details: [],
    })
    const [approval] = broker.list()
    expect(approval?.summary).toBe('Click "Send"')
    broker.respond(approval?.id ?? '', { decision: 'allow', scope: 'once' })
    expect(await pending).toEqual({ decision: 'allow', scope: 'once' })
    expect(broker.list()).toEqual([])
    expect(changes).toBe(2)
  })

  it('denies on timeout and when the run stops', async () => {
    const broker = new ApprovalBroker(20)
    const input = {
      tool: 'act',
      tier: 'financial' as const,
      summary: 'Pay',
      details: [],
    }
    expect((await broker.request(input)).decision).toBe('deny')

    const controller = new AbortController()
    const waiting = new ApprovalBroker().request(input, controller.signal)
    controller.abort()
    expect((await waiting).decision).toBe('deny')
  })
})

describe('PermissionGate', () => {
  function gate(answer: {
    decision: 'allow' | 'deny'
    scope: 'once' | 'run' | 'always'
  }) {
    const store = new PermissionsStore(join(root, 'p.json'))
    const asked: string[] = []
    const g = new PermissionGate({
      store,
      broker: {
        request: async (approval) => {
          asked.push(approval.summary)
          return answer
        },
      },
    })
    return { g, store, asked }
  }
  const sendArgs = { page: 1, kind: 'click', ref: 'e1' }
  const gateCtx = { ...ctx, conversationId: 'c1', unattended: false }

  it('asks once, then remembers "for this chat"', async () => {
    const { g, asked } = gate({ decision: 'allow', scope: 'run' })
    expect((await g.check('act', sendArgs, gateCtx)).allowed).toBe(true)
    expect((await g.check('act', sendArgs, gateCtx)).allowed).toBe(true)
    expect(asked).toHaveLength(1)
    // A different chat is asked again.
    await g.check('act', sendArgs, { ...gateCtx, conversationId: 'c2' })
    expect(asked).toHaveLength(2)
  })

  it('saves "always" as a rule', async () => {
    const { g, store } = gate({ decision: 'allow', scope: 'always' })
    await g.check('act', sendArgs, gateCtx)
    expect((await store.get()).rules[0]).toMatchObject({
      tool: 'act',
      app: 'mail.example.com',
      action: 'click',
      decision: 'allow',
    })
  })

  it('reports a decline to the agent without retry hints', async () => {
    const { g } = gate({ decision: 'deny', scope: 'once' })
    const result = await g.check('act', sendArgs, gateCtx)
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.message).toStartWith(PERMISSION_DENIED)
      expect(result.message).toContain("Don't retry")
    }
  })

  it('denies without asking when unattended, and uses the companion mode', async () => {
    const { g, asked } = gate({ decision: 'allow', scope: 'once' })
    expect(
      (await g.check('act', sendArgs, { ...gateCtx, unattended: true }))
        .allowed,
    ).toBe(false)
    expect(
      (
        await g.check('act', sendArgs, {
          ...gateCtx,
          permissions: { permissionMode: 'autopilot' },
        })
      ).allowed,
    ).toBe(true)
    expect(asked).toHaveLength(0)
  })
})

describe('permissions routes', () => {
  it('changes the mode, manages rules and answers approvals', async () => {
    const store = new PermissionsStore(join(root, 'r.json'))
    const broker = new ApprovalBroker()
    const app = createPermissionsRoutes({ store, broker })
    const json = (body: unknown) => ({
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    expect(
      (
        await app.request('/mode', {
          method: 'PUT',
          ...json({ mode: 'strict' }),
        })
      ).status,
    ).toBe(200)
    expect((await store.get()).mode).toBe('strict')
    expect(
      (await app.request('/mode', { method: 'PUT', ...json({ mode: 'yolo' }) }))
        .status,
    ).toBe(400)

    const created = await app.request('/rules', {
      method: 'POST',
      ...json({
        tool: 'act',
        tier: 'send_message',
        decision: 'allow',
        label: 'clicks',
      }),
    })
    const { rule } = (await created.json()) as { rule: PermissionRule }
    const patched = await app.request(`/rules/${rule.id}`, {
      method: 'PATCH',
      ...json({ decision: 'deny' }),
    })
    expect(patched.status).toBe(200)
    expect((await store.get()).rules[0]?.decision).toBe('deny')
    expect(
      (await app.request(`/rules/${rule.id}`, { method: 'DELETE' })).status,
    ).toBe(200)

    const waiting = broker.request({
      tool: 'act',
      tier: 'send_message',
      summary: 'Send',
      details: [],
    })
    const id = broker.list()[0]?.id
    const answered = await app.request(`/approvals/${id}`, {
      method: 'POST',
      ...json({ decision: 'deny' }),
    })
    expect(answered.status).toBe(200)
    expect((await waiting).decision).toBe('deny')
    const again = await app.request(`/approvals/${id}`, {
      method: 'POST',
      ...json({ decision: 'allow' }),
    })
    expect(again.status).toBe(404)
  })
})
