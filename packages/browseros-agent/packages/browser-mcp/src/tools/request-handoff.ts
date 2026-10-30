/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod/v4'
import { defineTool, errorResult, textResult } from './framework'

export const request_handoff = defineTool({
  name: 'request_handoff',
  description:
    "Hand a tab to the user for a step only they should do: signing in, a CAPTCHA, two-factor codes, or confirming a payment, send or delete. The tab shows the user a hand-back bar, and every tool on that tab is blocked until they hand it back. After calling this, end your turn with one short line saying what they need to do; you'll get a message when they're done. Don't use it for questions you can ask in chat.",
  input: z
    .object({
      page: z.number().int(),
      reason: z
        .enum(['sign_in', 'captcha', 'confirm', 'other'])
        .describe('What the user needs to do.'),
      message: z
        .string()
        .min(1)
        .max(200)
        .describe(
          'One short instruction shown on the page, e.g. "Sign in to LinkedIn, then hand back."',
        ),
    })
    .strict(),
  annotations: { title: 'Hand a tab to the user', readOnlyHint: true },
  handler: async (args, ctx) => {
    const tabId = ctx.session.pages.getTabId(args.page)
    if (tabId === undefined) {
      return errorResult(`request_handoff: unknown page ${args.page}.`)
    }
    return textResult(
      `Handed page ${args.page} to the user (${args.reason}). End your turn now; continue when they hand it back.`,
      { page: args.page, tabId, reason: args.reason, message: args.message },
    )
  },
})
