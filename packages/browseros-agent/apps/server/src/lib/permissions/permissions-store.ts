/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { PermissionModeId } from '@browseros/shared/schemas/companion'
import {
  type PermissionRule,
  type PermissionsConfig,
  PermissionsConfigSchema,
} from '@browseros/shared/schemas/permissions'
import { getBrowserosDir } from '../browseros-dir'
import { logger } from '../logger'

export type NewPermissionRule = Omit<PermissionRule, 'id' | 'createdAt'>

/** The user's permission mode and saved rules, in `<BrowserOS dir>/permissions.json`. */
export class PermissionsStore {
  private cache: PermissionsConfig | undefined
  private writing: Promise<void> = Promise.resolve()

  constructor(
    private readonly filePath = join(getBrowserosDir(), 'permissions.json'),
  ) {}

  async get(): Promise<PermissionsConfig> {
    if (this.cache) return this.cache
    try {
      const raw = JSON.parse(await readFile(this.filePath, 'utf8'))
      const parsed = PermissionsConfigSchema.safeParse(raw)
      if (parsed.success) {
        this.cache = parsed.data
        return this.cache
      }
      logger.warn('Invalid permissions.json; using defaults', {
        error: parsed.error.message,
      })
      await rename(this.filePath, `${this.filePath}.invalid-${Date.now()}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('Could not read permissions.json; using defaults', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    this.cache = PermissionsConfigSchema.parse({})
    return this.cache
  }

  async setMode(mode: PermissionModeId): Promise<PermissionsConfig> {
    return this.update((config) => ({ ...config, mode }))
  }

  /** Adds a rule, replacing any existing rule for the same tool + app + action. */
  async addRule(input: NewPermissionRule): Promise<PermissionRule> {
    const rule: PermissionRule = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    }
    await this.update((config) => ({
      ...config,
      rules: [
        ...config.rules.filter(
          (r) =>
            !(
              r.tool === rule.tool &&
              r.app === rule.app &&
              r.action === rule.action
            ),
        ),
        rule,
      ],
    }))
    return rule
  }

  async updateRule(
    id: string,
    patch: Pick<PermissionRule, 'decision'>,
  ): Promise<PermissionRule | undefined> {
    let updated: PermissionRule | undefined
    await this.update((config) => ({
      ...config,
      rules: config.rules.map((rule) => {
        if (rule.id !== id) return rule
        updated = { ...rule, ...patch }
        return updated
      }),
    }))
    return updated
  }

  async deleteRule(id: string): Promise<boolean> {
    let found = false
    await this.update((config) => ({
      ...config,
      rules: config.rules.filter((rule) => {
        if (rule.id === id) found = true
        return rule.id !== id
      }),
    }))
    return found
  }

  private async update(
    change: (config: PermissionsConfig) => PermissionsConfig,
  ): Promise<PermissionsConfig> {
    const next = PermissionsConfigSchema.parse(change(await this.get()))
    this.cache = next
    // Serialize writes so a fast sequence of changes lands in order.
    this.writing = this.writing.then(() => this.write(next))
    await this.writing
    return next
  }

  private async write(config: PermissionsConfig): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.tmp-${process.pid}-${Date.now()}`
    await writeFile(tmp, `${JSON.stringify(config, null, 2)}\n`)
    await rename(tmp, this.filePath)
  }
}

/** One per server process, shared by the policy check and the settings routes. */
export const permissionsStore = new PermissionsStore()
