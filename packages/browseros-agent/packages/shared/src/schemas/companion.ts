/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod'

export const COMPANION_SCHEMA_VERSION = 1
export const COMPANION_PERSONA_MAX_CHARS = 8000
export const COMPANION_MAX_STARTERS = 6

/** Folder-safe slug. Doubles as the on-disk directory name, so it must never contain path separators. */
export const CompanionIdSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9-]{1,47}$/,
    'Use 2-48 lowercase letters, digits or dashes',
  )

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const CompanionAvatarSchema = z
  .object({
    style: z.enum(['glyph', 'illustrated', '3d']).default('glyph'),
    seed: z.string().min(1).max(64),
    /** One or two characters shown by the glyph renderer; defaults to the name's first letter. */
    glyph: z.string().min(1).max(2).optional(),
    palette: z
      .object({
        primary: HexColorSchema,
        secondary: HexColorSchema,
        accent: HexColorSchema,
      })
      .strict(),
  })
  .strict()

export const CompanionStarterSchema = z
  .object({
    title: z.string().trim().min(1).max(60),
    prompt: z.string().trim().min(1).max(2000),
    icon: z.string().trim().min(1).max(32).optional(),
  })
  .strict()

export const CompanionSkillRefSchema = z
  .object({
    source: z.enum(['builtin', 'workspace', 'inline']),
    id: z.string().trim().min(1).max(120),
    inline: z
      .object({
        name: z.string().trim().min(1).max(80),
        description: z.string().trim().min(1).max(300),
        body: z.string().trim().min(1).max(8000),
      })
      .strict()
      .optional(),
  })
  .strict()

export const CompanionEffortSchema = z.enum(['quick', 'balanced', 'thorough'])
export const CompanionRunnerSchema = z.enum(['local', 'cloud', 'auto'])
export const PermissionModeIdSchema = z.enum([
  'ask_always',
  'balanced',
  'strict',
  'autopilot',
])

export const CompanionDefaultsSchema = z
  .object({
    effort: CompanionEffortSchema.default('balanced'),
    /** Stored provider id; absent means the user's selected provider. */
    providerId: z.string().trim().min(1).optional(),
    runner: CompanionRunnerSchema.default('local'),
    permissionMode: PermissionModeIdSchema.optional(),
  })
  .strict()

/** Prompt-level guidance in M1. The policy engine (M4) enforces the same fields. */
export const CompanionPolicySchema = z
  .object({
    toolsAllow: z.array(z.string().trim().min(1)).max(100).optional(),
    toolsDeny: z.array(z.string().trim().min(1)).max(100).optional(),
    domainsAllow: z.array(z.string().trim().min(1)).max(100).optional(),
    domainsDeny: z.array(z.string().trim().min(1)).max(100).optional(),
    browserProfile: z.enum(['user', 'isolated']).default('user'),
  })
  .strict()

export const CompanionOriginSchema = z.enum(['builtin', 'user', 'shared'])

/** What lives in `companions/<id>/companion.json`. The persona text lives next to it in `persona.md`. */
export const CompanionManifestSchema = z
  .object({
    schemaVersion: z.literal(COMPANION_SCHEMA_VERSION),
    id: CompanionIdSchema,
    origin: CompanionOriginSchema,
    /** Set when this folder overrides a built-in; used to offer merges when the built-in changes. */
    builtinVersion: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).max(40),
    tagline: z.string().trim().min(1).max(120),
    intro: z.string().trim().max(2000).default(''),
    role: z.string().trim().min(1).max(40).optional(),
    avatar: CompanionAvatarSchema,
    defaults: CompanionDefaultsSchema.default({
      effort: 'balanced',
      runner: 'local',
    }),
    skills: z.array(CompanionSkillRefSchema).max(50).default([]),
    apps: z.array(z.string().trim().min(1)).max(30).default([]),
    starters: z
      .array(CompanionStarterSchema)
      .max(COMPANION_MAX_STARTERS)
      .default([]),
    policy: CompanionPolicySchema.default({ browserProfile: 'user' }),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const CompanionSchema = CompanionManifestSchema.extend({
  persona: z.string().max(COMPANION_PERSONA_MAX_CHARS),
  contentHash: z.string(),
  /** Built-ins without a user override can't be edited in place; editing makes an override copy. */
  readOnly: z.boolean(),
})

const EditableFields = {
  name: CompanionManifestSchema.shape.name,
  tagline: CompanionManifestSchema.shape.tagline,
  intro: z.string().trim().max(2000).optional(),
  role: z.string().trim().min(1).max(40).optional(),
  avatar: CompanionAvatarSchema.optional(),
  defaults: CompanionDefaultsSchema.partial().optional(),
  skills: z.array(CompanionSkillRefSchema).max(50).optional(),
  apps: z.array(z.string().trim().min(1)).max(30).optional(),
  starters: z
    .array(CompanionStarterSchema)
    .max(COMPANION_MAX_STARTERS)
    .optional(),
  policy: CompanionPolicySchema.partial().optional(),
  persona: z.string().max(COMPANION_PERSONA_MAX_CHARS).optional(),
}

export const CreateCompanionInputSchema = z
  .object({
    ...EditableFields,
    /** Optional preferred id; the server makes it unique. */
    id: CompanionIdSchema.optional(),
  })
  .strict()

export const UpdateCompanionInputSchema = z
  .object({
    ...EditableFields,
    name: EditableFields.name.optional(),
    tagline: EditableFields.tagline.optional(),
  })
  .strict()

export type CompanionAvatar = z.infer<typeof CompanionAvatarSchema>
export type CompanionStarter = z.infer<typeof CompanionStarterSchema>
export type CompanionEffort = z.infer<typeof CompanionEffortSchema>
export type CompanionManifest = z.infer<typeof CompanionManifestSchema>
export type Companion = z.infer<typeof CompanionSchema>
export type CreateCompanionInput = z.infer<typeof CreateCompanionInputSchema>
export type UpdateCompanionInput = z.infer<typeof UpdateCompanionInputSchema>
