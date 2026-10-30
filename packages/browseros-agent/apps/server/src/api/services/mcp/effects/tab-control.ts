/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { TabControlReason } from '@browseros/shared/schemas/conversation-panels'
import { tabControl } from '../../../../lib/tab-control/tab-control-registry'
import type { BrowserToolEffect } from '../browser-tool-dispatch'

/** A successful request_handoff gives the tab to the user; the guard then blocks it. */
export const applyTabControl: BrowserToolEffect = ({ call, result }) => {
  if (result.isError || call.tool.name !== 'request_handoff') return
  const page = call.args.page
  if (typeof page !== 'number') return
  const tabId = call.context.session.pages.getTabId(page)
  if (tabId === undefined) return
  tabControl.takeOver(tabId, {
    reason: call.args.reason as TabControlReason,
    message: typeof call.args.message === 'string' ? call.args.message : '',
    conversationId: call.run?.conversationId,
  })
}
