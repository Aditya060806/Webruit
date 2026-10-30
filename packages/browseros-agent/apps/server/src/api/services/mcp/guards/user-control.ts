/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  errorResult,
  type ToolResult,
} from '@browseros/browser-mcp/tools/framework'
import type { TabControl } from '@browseros/shared/schemas/conversation-panels'
import {
  type TabControlRegistry,
  tabControl,
} from '../../../../lib/tab-control/tab-control-registry'
import type { BrowserToolGuard } from '../browser-tool-dispatch'

export const USER_HAS_CONTROL = 'USER_HAS_CONTROL'

const REASON_TEXT: Record<TabControl['reason'], string> = {
  take_over: 'took over this tab',
  sign_in: 'is signing in on this tab',
  captcha: 'is solving a CAPTCHA on this tab',
  confirm: 'is reviewing this step on this tab',
  other: 'has control of this tab',
}

function blocked(control: TabControl, page: number): ToolResult {
  return errorResult(
    `${USER_HAS_CONTROL}: the user ${REASON_TEXT[control.reason]} (page ${page}). Don't read or act on it. Finish anything you can do elsewhere, then end your turn and say you'll continue when they hand control back. Don't retry this tab.`,
  )
}

function runBlocked(): ToolResult {
  return errorResult(
    `${USER_HAS_CONTROL}: the user is driving a tab, and run can reach any page, so run is unavailable until they hand it back. Use the other browser tools on other pages instead.`,
  )
}

/**
 * Blocks every tool aimed at a user-held tab, reads included: the user may be
 * typing a password. `run` can reach any page without naming it, so it is
 * blocked while any tab is held.
 */
export function guardUserControlCall(
  registry: TabControlRegistry,
  toolName: string,
  args: Record<string, unknown>,
  tabIdForPage: (page: number) => number | undefined,
): ToolResult | null {
  if (toolName === 'request_handoff') return null
  if (toolName === 'run') {
    return registry.hasUserControlledTabs() ? runBlocked() : null
  }
  if (typeof args.page !== 'number') return null
  const tabId = tabIdForPage(args.page)
  if (tabId === undefined) return null
  const control = registry.get(tabId)
  return control ? blocked(control, args.page) : null
}

export const guardUserControl: BrowserToolGuard = (call) =>
  guardUserControlCall(tabControl, call.tool.name, call.args, (page) =>
    call.context.session.pages.getTabId(page),
  )
