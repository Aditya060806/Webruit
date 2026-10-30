/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  type TabControlRegistry,
  tabControl,
} from '../../lib/tab-control/tab-control-registry'

const TabIdParamSchema = z.object({
  tabId: z.coerce.number().int().nonnegative(),
})

const TakeOverBodySchema = z.object({
  conversationId: z.string().max(200).optional(),
})

export function createTabControlRoutes(
  deps: { registry?: TabControlRegistry } = {},
) {
  const registry = deps.registry ?? tabControl
  return new Hono()
    .get('/', (c) => c.json({ tabs: registry.list() }))
    .post(
      '/:tabId/take-over',
      zValidator('param', TabIdParamSchema),
      zValidator('json', TakeOverBodySchema),
      (c) => {
        const { tabId } = c.req.valid('param')
        const { conversationId } = c.req.valid('json')
        const control = registry.takeOver(tabId, {
          reason: 'take_over',
          conversationId,
        })
        return c.json({ tabId, control })
      },
    )
    .post('/:tabId/hand-back', zValidator('param', TabIdParamSchema), (c) => {
      const { tabId } = c.req.valid('param')
      const released = registry.handBack(tabId) ?? null
      return c.json({ tabId, released })
    })
}
