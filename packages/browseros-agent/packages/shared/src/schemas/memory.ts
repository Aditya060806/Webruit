/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod'

export const MEMORY_NOTE_MAX_CHARS = 512
export const MEMORY_NOTE_MAX_TAGS = 20

const TagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(40)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u, 'Letters, numbers, spaces, - or _')

/** "global", or the id of the companion the note belongs to. */
export const MemoryScopeSchema = z
  .string()
  .regex(/^(global|[a-z0-9][a-z0-9-]{1,47})$/)

export const MemoryNoteSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{12}$/),
  text: z.string().trim().min(1).max(MEMORY_NOTE_MAX_CHARS),
  tags: z.array(TagSchema).max(MEMORY_NOTE_MAX_TAGS).default([]),
  scope: MemoryScopeSchema.default('global'),
  author: z.enum(['user', 'agent']),
  /** The chat the agent saved it from. */
  sourceConversationId: z.string().max(80).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const CreateMemoryNoteInputSchema = MemoryNoteSchema.pick({
  text: true,
  tags: true,
  scope: true,
})

export const UpdateMemoryNoteInputSchema = CreateMemoryNoteInputSchema.partial()

export type MemoryNote = z.infer<typeof MemoryNoteSchema>
export type CreateMemoryNoteInput = z.input<typeof CreateMemoryNoteInputSchema>
export type UpdateMemoryNoteInput = z.infer<typeof UpdateMemoryNoteInputSchema>
