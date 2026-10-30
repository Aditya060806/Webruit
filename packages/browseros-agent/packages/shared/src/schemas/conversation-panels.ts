/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod'
import { PendingApprovalSchema } from './permissions'

export const ConversationRunStatusSchema = z.enum([
  'running',
  'completed',
  'aborted',
  'failed',
])

/** Why the user, not the agent, is driving a tab. Webruit addition (2026). */
export const TabControlReasonSchema = z.enum([
  'take_over',
  'sign_in',
  'captcha',
  'confirm',
  'other',
])

/** Present only while the user holds a tab; the agent's page tools are blocked on it. */
export const TabControlSchema = z.object({
  mode: z.literal('user'),
  reason: TabControlReasonSchema,
  message: z.string().max(300).optional(),
  conversationId: z.string().optional(),
  since: z.string(),
})

/**
 * Maps one browser tab's side panel to the conversation run it should display.
 * The server owns this assignment so clients never infer it from tool output.
 */
export const ConversationPanelAssignmentSchema = z.object({
  tabId: z.number().int(),
  conversationId: z.string(),
  runId: z.string(),
  status: ConversationRunStatusSchema,
  // A creation event, stable across turns. Routing updates never imply opening.
  autoOpenId: z.string().optional(),
})

/**
 * The server's complete current panel routing table. Every SSE message carries
 * all assignments, so a reconnect or heartbeat can repair missed client work
 * without replaying an event history.
 */
export const ConversationPanelAssignmentsSchema = z.object({
  assignments: z.array(ConversationPanelAssignmentSchema),
  // Tabs the user holds, whether or not a conversation owns them. Omitted when empty.
  controls: z
    .array(z.object({ tabId: z.number().int(), control: TabControlSchema }))
    .optional(),
  // Actions waiting for the user's approval. Omitted when empty.
  approvals: z.array(PendingApprovalSchema).optional(),
})

export type ConversationRunStatus = z.infer<typeof ConversationRunStatusSchema>
export type ConversationPanelAssignment = z.infer<
  typeof ConversationPanelAssignmentSchema
>
export type ConversationPanelAssignments = z.infer<
  typeof ConversationPanelAssignmentsSchema
>
export type TabControlReason = z.infer<typeof TabControlReasonSchema>
export type TabControl = z.infer<typeof TabControlSchema>
