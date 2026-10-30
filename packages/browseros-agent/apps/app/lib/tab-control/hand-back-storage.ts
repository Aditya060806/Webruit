/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { TabControlReason } from '@browseros/shared/schemas/conversation-panels'
import { storage } from '@wxt-dev/storage'

interface HandBackSignal {
  conversationId: string
  reason: TabControlReason
  timestamp: number
}

/** Background → chat panel: the user handed a tab back, so the waiting conversation should continue. */
export const handBackStorage = storage.defineItem<HandBackSignal | null>(
  'local:webruit-hand-back',
  { fallback: null },
)
