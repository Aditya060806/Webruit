/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { PendingApproval } from '@browseros/shared/schemas/permissions'
import { storage } from '@wxt-dev/storage'

/**
 * Background-owned copy of the server's waiting approvals, refreshed from the
 * panel stream. Session storage: approvals never outlive the browser session.
 */
export const pendingApprovalsStorage = storage.defineItem<PendingApproval[]>(
  'session:webruit.pending_approvals',
  { fallback: [] },
)

// Empty so the first message after a worker restart always overwrites stale storage.
let lastSnapshot = ''

/**
 * Background only: mirrors the stream's approvals into storage when they change
 * (heartbeats repeat the same list) and shows the count on the toolbar icon so a
 * closed side panel still signals that something is waiting.
 */
export function applyPendingApprovals(approvals: PendingApproval[]): void {
  const snapshot = JSON.stringify(approvals)
  if (snapshot === lastSnapshot) return
  lastSnapshot = snapshot
  void pendingApprovalsStorage.setValue(approvals).catch(() => undefined)
  void chrome.action
    .setBadgeText({
      text: approvals.length > 0 ? String(approvals.length) : '',
    })
    .catch(() => undefined)
  if (approvals.length > 0) {
    void chrome.action
      .setBadgeBackgroundColor({ color: '#7C5CFF' })
      .catch(() => undefined)
  }
}
