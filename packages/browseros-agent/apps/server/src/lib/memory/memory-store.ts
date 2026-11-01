/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomBytes } from 'node:crypto'
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import {
  type CreateMemoryNoteInput,
  CreateMemoryNoteInputSchema,
  type MemoryNote,
  MemoryNoteSchema,
  type UpdateMemoryNoteInput,
  UpdateMemoryNoteInputSchema,
} from '@browseros/shared/schemas/memory'
import { getBrowserosDir } from '../browseros-dir'
import { logger } from '../logger'

const CACHE_MS = 5_000

const HEADER_KEYS = [
  'id',
  'scope',
  'tags',
  'author',
  'source',
  'created',
  'updated',
] as const

/** One note per file, readable and editable by hand. */
export function serializeNote(note: MemoryNote): string {
  const header = [
    `id: ${note.id}`,
    `scope: ${note.scope}`,
    `tags: ${JSON.stringify(note.tags)}`,
    `author: ${note.author}`,
    ...(note.sourceConversationId
      ? [`source: ${note.sourceConversationId}`]
      : []),
    `created: ${note.createdAt}`,
    `updated: ${note.updatedAt}`,
  ]
  return `---\n${header.join('\n')}\n---\n${note.text}\n`
}

export function parseNote(raw: string): MemoryNote | undefined {
  const match = raw
    .replace(/\r\n/g, '\n')
    .match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return undefined
  const fields: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const at = line.indexOf(':')
    if (at < 0) continue
    const key = line.slice(0, at).trim()
    if ((HEADER_KEYS as readonly string[]).includes(key)) {
      fields[key] = line.slice(at + 1).trim()
    }
  }
  let tags: unknown = []
  try {
    tags = fields.tags ? JSON.parse(fields.tags) : []
  } catch {
    return undefined
  }
  const parsed = MemoryNoteSchema.safeParse({
    id: fields.id,
    text: match[2].trim(),
    tags,
    scope: fields.scope,
    author: fields.author,
    sourceConversationId: fields.source,
    createdAt: fields.created,
    updatedAt: fields.updated,
  })
  return parsed.success ? parsed.data : undefined
}

/**
 * Memory notes under `<BrowserOS dir>/memory/notes/<id>.md`. All notes are
 * cached in memory after the first read; the set is small (short notes).
 */
export class MemoryStore {
  private cache: Map<string, MemoryNote> | undefined
  private loading: Promise<Map<string, MemoryNote>> | undefined
  private loadedAt = 0

  constructor(
    private readonly dir = join(getBrowserosDir(), 'memory', 'notes'),
  ) {}

  async list(): Promise<MemoryNote[]> {
    const notes = [...(await this.load()).values()]
    return notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async get(id: string): Promise<MemoryNote | undefined> {
    return (await this.load()).get(id)
  }

  async create(
    input: CreateMemoryNoteInput,
    meta: { author: MemoryNote['author']; sourceConversationId?: string },
  ): Promise<MemoryNote> {
    const valid = CreateMemoryNoteInputSchema.parse(input)
    const now = new Date().toISOString()
    const note = MemoryNoteSchema.parse({
      ...valid,
      tags: [...new Set(valid.tags)],
      id: randomBytes(6).toString('hex'),
      author: meta.author,
      sourceConversationId: meta.sourceConversationId,
      createdAt: now,
      updatedAt: now,
    })
    await this.write(note)
    return note
  }

  async update(
    id: string,
    patch: UpdateMemoryNoteInput,
  ): Promise<MemoryNote | undefined> {
    const existing = await this.get(id)
    if (!existing) return undefined
    const valid = UpdateMemoryNoteInputSchema.parse(patch)
    const note = MemoryNoteSchema.parse({
      ...existing,
      ...valid,
      ...(valid.tags && { tags: [...new Set(valid.tags)] }),
      updatedAt: new Date().toISOString(),
    })
    await this.write(note)
    return note
  }

  async delete(id: string): Promise<boolean> {
    const notes = await this.load()
    if (!notes.has(id)) return false
    await rm(this.fileFor(id), { force: true })
    notes.delete(id)
    return true
  }

  private fileFor(id: string): string {
    return join(this.dir, `${id}.md`)
  }

  private async write(note: MemoryNote): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    const file = this.fileFor(note.id)
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
    await writeFile(tmp, serializeNote(note))
    await rename(tmp, file)
    ;(await this.load()).set(note.id, note)
  }

  // Re-read the folder at most every few seconds so hand edits show up.
  private async load(): Promise<Map<string, MemoryNote>> {
    if (this.cache && Date.now() - this.loadedAt < CACHE_MS) return this.cache
    this.loading ??= this.readAll()
      .then((notes) => {
        this.cache = notes
        this.loadedAt = Date.now()
        return notes
      })
      .finally(() => {
        this.loading = undefined
      })
    return this.loading
  }

  private async readAll(): Promise<Map<string, MemoryNote>> {
    const notes = new Map<string, MemoryNote>()
    let files: string[] = []
    try {
      files = await readdir(this.dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return notes
    }
    for (const file of files) {
      if (!file.endsWith('.md')) continue
      const note = parseNote(await readFile(join(this.dir, file), 'utf8'))
      if (note && file === `${note.id}.md`) notes.set(note.id, note)
      else logger.warn('Skipping unreadable memory note', { file })
    }
    return notes
  }
}

/** One per server process, shared by agent tools, recall and routes. */
export const memoryStore = new MemoryStore()
