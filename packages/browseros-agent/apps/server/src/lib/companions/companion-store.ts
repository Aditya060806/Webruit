/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createHash, randomBytes } from 'node:crypto'
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
  COMPANION_PERSONA_MAX_CHARS,
  type Companion,
  CompanionIdSchema,
  type CompanionManifest,
  CompanionManifestSchema,
  type CreateCompanionInput,
  type UpdateCompanionInput,
} from '@browseros/shared/schemas/companion'
import { getBrowserosDir } from '../browseros-dir'
import { logger } from '../logger'
import {
  BUILTIN_COMPANIONS,
  BUILTIN_COMPANIONS_VERSION,
  DEFAULT_COMPANION_ID,
} from './builtin-companions'

const MANIFEST_FILE = 'companion.json'
const PERSONA_FILE = 'persona.md'

export function getCompanionsDir(): string {
  return join(getBrowserosDir(), 'companions')
}

export class CompanionNotEditableError extends Error {}

/**
 * Companions live as folders: `<root>/<id>/companion.json` + `persona.md`.
 * Built-ins ship in code; a folder with a built-in's id is the user's override
 * of it, and deleting that folder resets the companion to the shipped version.
 */
export class CompanionStore {
  constructor(private readonly rootDir: string = getCompanionsDir()) {}

  async list(): Promise<Companion[]> {
    const onDisk = await this.readAllFromDisk()
    const result = new Map<string, Companion>()
    for (const builtin of BUILTIN_COMPANIONS) {
      result.set(builtin.manifest.id, this.fromBuiltin(builtin.manifest.id))
    }
    for (const companion of onDisk) result.set(companion.id, companion)
    return [...result.values()].sort(compareCompanions)
  }

  async get(id: string): Promise<Companion | null> {
    if (!CompanionIdSchema.safeParse(id).success) return null
    const fromDisk = await this.readFromDisk(id)
    if (fromDisk) return fromDisk
    return BUILTIN_COMPANIONS.some((b) => b.manifest.id === id)
      ? this.fromBuiltin(id)
      : null
  }

  /** Falls back to the default companion so a stale id from the client never breaks a chat. */
  async resolve(id: string | undefined): Promise<Companion> {
    const found = id ? await this.get(id) : null
    return found ?? this.fromBuiltin(DEFAULT_COMPANION_ID)
  }

  async create(input: CreateCompanionInput): Promise<Companion> {
    const id = await this.uniqueId(input.id ?? slugify(input.name))
    const now = new Date().toISOString()
    const manifest = CompanionManifestSchema.parse({
      schemaVersion: 1,
      id,
      origin: 'user',
      name: input.name,
      tagline: input.tagline,
      intro: input.intro ?? '',
      role: input.role,
      avatar: input.avatar ?? defaultAvatar(id, input.name),
      defaults: input.defaults,
      skills: input.skills,
      apps: input.apps,
      starters: input.starters,
      policy: input.policy,
      createdAt: now,
      updatedAt: now,
    })
    await this.write(manifest, input.persona ?? '')
    return this.toCompanion(manifest, input.persona ?? '', false)
  }

  async update(
    id: string,
    patch: UpdateCompanionInput,
  ): Promise<Companion | null> {
    const existing = await this.get(id)
    if (!existing) return null
    const { persona: _p, contentHash: _h, readOnly: _r, ...current } = existing
    const manifest = CompanionManifestSchema.parse({
      ...current,
      ...stripUndefined({
        name: patch.name,
        tagline: patch.tagline,
        intro: patch.intro,
        role: patch.role,
        avatar: patch.avatar,
        skills: patch.skills,
        apps: patch.apps,
        starters: patch.starters,
      }),
      defaults: {
        ...current.defaults,
        ...stripUndefined(patch.defaults ?? {}),
      },
      policy: { ...current.policy, ...stripUndefined(patch.policy ?? {}) },
      // Editing a built-in creates the override folder; it keeps origin 'builtin' plus the version it was copied from.
      builtinVersion:
        current.origin === 'builtin'
          ? (current.builtinVersion ?? BUILTIN_COMPANIONS_VERSION)
          : current.builtinVersion,
      updatedAt: new Date().toISOString(),
    })
    const persona = patch.persona ?? existing.persona
    await this.write(manifest, persona)
    return this.toCompanion(manifest, persona, false)
  }

  /** Returns false when there is nothing on disk to delete (unknown id, or an unmodified built-in). */
  async delete(id: string): Promise<boolean> {
    if (!CompanionIdSchema.safeParse(id).success) return false
    const dir = join(this.rootDir, id)
    const exists = await this.readFromDisk(id)
    if (!exists) return false
    await rm(dir, { recursive: true, force: true })
    return true
  }

  private fromBuiltin(id: string): Companion {
    const builtin = BUILTIN_COMPANIONS.find((b) => b.manifest.id === id)
    if (!builtin) throw new Error(`Unknown built-in companion: ${id}`)
    // Fixed timestamps keep the content hash stable across restarts.
    const manifest = CompanionManifestSchema.parse({
      ...builtin.manifest,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    })
    return this.toCompanion(manifest, builtin.persona, true)
  }

  private toCompanion(
    manifest: CompanionManifest,
    persona: string,
    readOnly: boolean,
  ): Companion {
    const trimmedPersona = persona.slice(0, COMPANION_PERSONA_MAX_CHARS)
    return {
      ...manifest,
      persona: trimmedPersona,
      contentHash: hashContent(manifest, trimmedPersona),
      readOnly,
    }
  }

  private async readAllFromDisk(): Promise<Companion[]> {
    let entries: string[]
    try {
      entries = await readdir(this.rootDir)
    } catch (error) {
      if (isNotFound(error)) return []
      throw error
    }
    const companions = await Promise.all(
      entries
        .filter((name) => CompanionIdSchema.safeParse(name).success)
        .map((name) => this.readFromDisk(name)),
    )
    return companions.filter((c): c is Companion => c !== null)
  }

  private async readFromDisk(id: string): Promise<Companion | null> {
    const dir = join(this.rootDir, id)
    let raw: string
    try {
      raw = await readFile(join(dir, MANIFEST_FILE), 'utf8')
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
    const parsed = CompanionManifestSchema.safeParse(safeJson(raw))
    if (!parsed.success || parsed.data.id !== id) {
      await this.backUpInvalid(
        dir,
        parsed.success ? 'id does not match folder' : parsed.error.message,
      )
      return null
    }
    const persona = await readFile(join(dir, PERSONA_FILE), 'utf8').catch(
      () => '',
    )
    return this.toCompanion(parsed.data, persona, false)
  }

  private async backUpInvalid(dir: string, reason: string): Promise<void> {
    const backup = join(dir, `${MANIFEST_FILE}.invalid-${Date.now()}`)
    logger.warn('Invalid companion manifest moved aside', {
      dir,
      reason,
      backup,
    })
    await rename(join(dir, MANIFEST_FILE), backup).catch((error) => {
      logger.warn('Could not back up invalid companion manifest', {
        dir,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }

  private async write(
    manifest: CompanionManifest,
    persona: string,
  ): Promise<void> {
    const dir = join(this.rootDir, manifest.id)
    await mkdir(dir, { recursive: true })
    await writeAtomic(
      join(dir, MANIFEST_FILE),
      `${JSON.stringify(manifest, null, 2)}\n`,
    )
    await writeAtomic(join(dir, PERSONA_FILE), persona)
  }

  private async uniqueId(base: string): Promise<string> {
    const seed = CompanionIdSchema.safeParse(base).success
      ? base
      : `companion-${randomBytes(3).toString('hex')}`
    let candidate = seed
    for (let n = 2; await this.get(candidate); n++) {
      candidate = `${seed.slice(0, 44)}-${n}`
    }
    return candidate
  }
}

async function writeAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, path)
}

function hashContent(manifest: CompanionManifest, persona: string): string {
  const { createdAt: _c, updatedAt: _u, ...stable } = manifest
  return createHash('sha256')
    .update(JSON.stringify(stable))
    .update('\0')
    .update(persona)
    .digest('hex')
}

function compareCompanions(a: Companion, b: Companion): number {
  if (a.id === DEFAULT_COMPANION_ID) return -1
  if (b.id === DEFAULT_COMPANION_ID) return 1
  const rank = (c: Companion) => (c.origin === 'builtin' ? 0 : 1)
  return rank(a) - rank(b) || a.name.localeCompare(b.name)
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function defaultAvatar(id: string, name: string) {
  const hue =
    Number.parseInt(
      createHash('sha1').update(id).digest('hex').slice(0, 2),
      16,
    ) / 255
  return {
    style: 'glyph' as const,
    seed: id,
    glyph: name.trim().charAt(0).toUpperCase() || '?',
    palette: {
      primary: hslToHex(hue, 0.55, 0.45),
      secondary: hslToHex(hue, 0.6, 0.18),
      accent: hslToHex((hue + 0.4) % 1, 0.8, 0.75),
    },
  }
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'ENOENT'
  )
}
