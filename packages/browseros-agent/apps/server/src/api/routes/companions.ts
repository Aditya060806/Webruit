/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  CompanionIdSchema,
  CreateCompanionInputSchema,
  UpdateCompanionInputSchema,
} from '@browseros/shared/schemas/companion'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { CompanionStore } from '../../lib/companions/companion-store'
import type { Env } from '../types'

const CompanionIdParamsSchema = z.object({ companionId: CompanionIdSchema })

type CompanionRouteStore = Pick<
  CompanionStore,
  'list' | 'get' | 'create' | 'update' | 'delete'
>

export function createCompanionRoutes(
  options: { store?: CompanionRouteStore } = {},
) {
  const store = options.store ?? new CompanionStore()

  return new Hono<Env>()
    .get('/', async (c) => c.json({ companions: await store.list() }))
    .post('/', zValidator('json', CreateCompanionInputSchema), async (c) =>
      c.json({ companion: await store.create(c.req.valid('json')) }, 201),
    )
    .get(
      '/:companionId',
      zValidator('param', CompanionIdParamsSchema),
      async (c) => {
        const companion = await store.get(c.req.valid('param').companionId)
        if (!companion) return c.json({ error: 'Unknown companion' }, 404)
        return c.json({ companion })
      },
    )
    .patch(
      '/:companionId',
      zValidator('param', CompanionIdParamsSchema),
      zValidator('json', UpdateCompanionInputSchema),
      async (c) => {
        const companion = await store.update(
          c.req.valid('param').companionId,
          c.req.valid('json'),
        )
        if (!companion) return c.json({ error: 'Unknown companion' }, 404)
        return c.json({ companion })
      },
    )
    .delete(
      '/:companionId',
      zValidator('param', CompanionIdParamsSchema),
      async (c) => {
        // For a built-in this removes the user's override and restores the shipped version.
        const deleted = await store.delete(c.req.valid('param').companionId)
        if (!deleted) {
          return c.json({ error: 'Nothing to delete for this companion' }, 404)
        }
        return c.json({ success: true })
      },
    )
}
