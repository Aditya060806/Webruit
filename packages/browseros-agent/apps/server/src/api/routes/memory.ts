/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  CreateMemoryNoteInputSchema,
  UpdateMemoryNoteInputSchema,
} from '@browseros/shared/schemas/memory'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { searchNotes } from '../../lib/memory/memory-search'
import { type MemoryStore, memoryStore } from '../../lib/memory/memory-store'

const IdParamSchema = z.object({ id: z.string().regex(/^[a-f0-9]{12}$/) })

const ListQuerySchema = z.object({
  q: z.string().max(200).optional(),
  scope: z.string().max(48).optional(),
})

export function createMemoryRoutes(deps: { store?: MemoryStore } = {}) {
  const store = deps.store ?? memoryStore
  return new Hono()
    .get('/', zValidator('query', ListQuerySchema), async (c) => {
      const { q, scope } = c.req.valid('query')
      let notes = await store.list()
      if (scope) notes = notes.filter((note) => note.scope === scope)
      if (q?.trim()) {
        notes = searchNotes(notes, q, { limit: 200, companionId: scope }).map(
          (scored) => scored.note,
        )
      }
      return c.json({ notes })
    })
    .post('/', zValidator('json', CreateMemoryNoteInputSchema), async (c) => {
      const note = await store.create(c.req.valid('json'), { author: 'user' })
      return c.json({ note }, 201)
    })
    .patch(
      '/:id',
      zValidator('param', IdParamSchema),
      zValidator('json', UpdateMemoryNoteInputSchema),
      async (c) => {
        const note = await store.update(
          c.req.valid('param').id,
          c.req.valid('json'),
        )
        return note ? c.json({ note }) : c.json({ error: 'Not found' }, 404)
      },
    )
    .delete('/:id', zValidator('param', IdParamSchema), async (c) => {
      const deleted = await store.delete(c.req.valid('param').id)
      return deleted
        ? c.json({ ok: true })
        : c.json({ error: 'Not found' }, 404)
    })
}
