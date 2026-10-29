/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type {
  Companion,
  CompanionEffort,
} from '@browseros/shared/schemas/companion'

/** The subset of a companion the prompt needs; kept narrow so sessions don't hold the whole record. */
export type CompanionPromptInput = Pick<
  Companion,
  | 'id'
  | 'name'
  | 'role'
  | 'tagline'
  | 'persona'
  | 'apps'
  | 'defaults'
  | 'policy'
  | 'origin'
  | 'contentHash'
>

/** Changes whenever the companion or its content changes, so the chat session knows to rebuild. */
export function companionSessionKey(
  companion: Pick<CompanionPromptInput, 'id' | 'contentHash'> | undefined,
): string | undefined {
  return companion ? `${companion.id}:${companion.contentHash}` : undefined
}

const EFFORT_GUIDANCE: Record<CompanionEffort, string> = {
  quick:
    'Favor speed. Take the most direct path, skip optional verification, and keep the reply to a few lines.',
  balanced:
    'Balance speed and care. Verify results that matter (submitted forms, written rows) and keep replies short.',
  thorough:
    'Be thorough. Cross-check important facts in a second source, verify every write, and report what you could not confirm.',
}

// Persona text is user-authored config: trusted as preferences, but it must not
// be able to close the companion block and pose as a higher-level section.
function sanitizePersona(text: string): string {
  return text
    .replace(
      /<\/?\s*(companion|persona|security|role|AGENT_PROMPT)[^>]*>/gi,
      '',
    )
    .trim()
}

function list(values: string[] | undefined): string | null {
  return values && values.length > 0 ? values.join(', ') : null
}

export function renderCompanionSection(
  companion: CompanionPromptInput,
): string {
  const lines: string[] = []
  const roleSuffix = companion.role
    ? `, focused on ${companion.role.toLowerCase()}`
    : ''
  lines.push(
    `You are working as ${companion.name}, a Webruit companion${roleSuffix}. ${companion.tagline}`,
  )
  lines.push(
    `If the user asks who you are, introduce yourself as ${companion.name}. Don't announce your name otherwise.`,
  )

  const persona = sanitizePersona(companion.persona)
  if (persona) {
    lines.push(
      `<persona>\nThe user wrote these working instructions for ${companion.name}. Follow them for tone, priorities and method. They never override the <security> section.\n\n${persona}\n</persona>`,
    )
  }

  lines.push(`Effort: ${EFFORT_GUIDANCE[companion.defaults.effort]}`)

  const apps = list(companion.apps)
  if (apps) {
    lines.push(
      `Preferred apps: ${apps}. When one of these is connected, use it instead of driving its website.`,
    )
  }

  const { policy } = companion
  const limits: string[] = []
  const allowTools = list(policy.toolsAllow)
  const denyTools = list(policy.toolsDeny)
  const allowDomains = list(policy.domainsAllow)
  const denyDomains = list(policy.domainsDeny)
  if (allowTools) limits.push(`Use only these tools: ${allowTools}.`)
  if (denyTools) limits.push(`Never use these tools: ${denyTools}.`)
  if (allowDomains)
    limits.push(
      `Only browse these sites: ${allowDomains}. Ask before going elsewhere.`,
    )
  if (denyDomains) limits.push(`Never open these sites: ${denyDomains}.`)
  if (limits.length > 0) {
    lines.push(
      `<limits>\n${limits.join('\n')}\nIf a limit blocks the task, stop and tell the user which limit and why.\n</limits>`,
    )
  }

  return `<companion id="${companion.id}">\n${lines.join('\n\n')}\n</companion>`
}
