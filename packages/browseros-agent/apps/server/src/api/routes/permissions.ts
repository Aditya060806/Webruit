/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { PermissionModeIdSchema } from '@browseros/shared/schemas/companion'
import {
  ApprovalResponseSchema,
  PermissionRuleSchema,
} from '@browseros/shared/schemas/permissions'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  type ApprovalBroker,
  approvalBroker,
} from '../../lib/permissions/approval-broker'
import {
  type PermissionsStore,
  permissionsStore,
} from '../../lib/permissions/permissions-store'

const IdParamSchema = z.object({ id: z.string().min(1).max(64) })

const NewRuleSchema = PermissionRuleSchema.omit({ id: true, createdAt: true })

export function createPermissionsRoutes(
  deps: { store?: PermissionsStore; broker?: ApprovalBroker } = {},
) {
  const store = deps.store ?? permissionsStore
  const broker = deps.broker ?? approvalBroker
  return new Hono()
    .get('/', async (c) => c.json(await store.get()))
    .put(
      '/mode',
      zValidator('json', z.object({ mode: PermissionModeIdSchema })),
      async (c) => c.json(await store.setMode(c.req.valid('json').mode)),
    )
    .post('/rules', zValidator('json', NewRuleSchema), async (c) => {
      const rule = await store.addRule(c.req.valid('json'))
      return c.json({ rule }, 201)
    })
    .patch(
      '/rules/:id',
      zValidator('param', IdParamSchema),
      zValidator('json', PermissionRuleSchema.pick({ decision: true })),
      async (c) => {
        const rule = await store.updateRule(
          c.req.valid('param').id,
          c.req.valid('json'),
        )
        return rule ? c.json({ rule }) : c.json({ error: 'Not found' }, 404)
      },
    )
    .delete('/rules/:id', zValidator('param', IdParamSchema), async (c) => {
      const deleted = await store.deleteRule(c.req.valid('param').id)
      return deleted
        ? c.json({ ok: true })
        : c.json({ error: 'Not found' }, 404)
    })
    .get('/approvals', (c) => c.json({ approvals: broker.list() }))
    .post(
      '/approvals/:id',
      zValidator('param', IdParamSchema.extend({ id: z.string().uuid() })),
      zValidator('json', ApprovalResponseSchema),
      (c) => {
        const answered = broker.respond(
          c.req.valid('param').id,
          c.req.valid('json'),
        )
        return answered
          ? c.json({ ok: true })
          : c.json({ error: 'This request already finished.' }, 404)
      },
    )
}
