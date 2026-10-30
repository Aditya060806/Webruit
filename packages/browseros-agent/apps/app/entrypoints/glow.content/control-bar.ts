/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { TabControl } from '@browseros/shared/schemas/conversation-panels'

const STYLES_ID = 'webruit-control-bar-styles'
const AGENT_BAR_ID = 'webruit-agent-bar'
const USER_BAR_ID = 'webruit-user-bar'

const USER_BAR_TITLE: Record<TabControl['reason'], string> = {
  take_over: 'You have control of this tab',
  sign_in: 'Sign in, then hand back',
  captcha: 'Solve the check, then hand back',
  confirm: 'Review this step, then hand back',
  other: 'Your turn on this tab',
}

function injectStyles(): void {
  if (document.getElementById(STYLES_ID)) return
  const style = document.createElement('style')
  style.id = STYLES_ID
  style.textContent = `
    #${AGENT_BAR_ID}, #${USER_BAR_ID} {
      all: initial !important;
      position: fixed !important;
      bottom: 24px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      max-width: calc(100vw - 32px) !important;
      box-sizing: border-box !important;
      padding: 8px 8px 8px 16px !important;
      border-radius: 999px !important;
      font: 500 13px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif !important;
      color: #ffffff !important;
      box-shadow: 0 6px 24px rgba(20, 10, 60, 0.35) !important;
      pointer-events: auto !important;
    }
    #${AGENT_BAR_ID} { background: rgba(28, 22, 52, 0.94) !important; }
    #${USER_BAR_ID} { background: #3B1FC9 !important; }
    #${AGENT_BAR_ID} .wr-label, #${USER_BAR_ID} .wr-label {
      all: initial !important;
      font: inherit !important;
      color: inherit !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
    #${USER_BAR_ID} .wr-detail {
      all: initial !important;
      font: 400 12px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif !important;
      color: rgba(255, 255, 255, 0.82) !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      max-width: 340px !important;
    }
    .wr-btn {
      all: initial !important;
      font: 600 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif !important;
      padding: 8px 14px !important;
      border-radius: 999px !important;
      cursor: pointer !important;
      white-space: nowrap !important;
    }
    .wr-btn:disabled { opacity: 0.6 !important; cursor: default !important; }
    .wr-primary { background: #ffffff !important; color: #2A1690 !important; }
    .wr-primary:hover { background: #ECE8FF !important; }
    .wr-ghost { background: rgba(255, 255, 255, 0.14) !important; color: #ffffff !important; }
    .wr-ghost:hover { background: rgba(255, 255, 255, 0.24) !important; }
    .wr-stop { background: rgba(220, 38, 38, 0.95) !important; color: #ffffff !important; }
    .wr-stop:hover { background: rgba(185, 28, 28, 1) !important; }
  `
  ;(document.head ?? document.documentElement).appendChild(style)
}

function button(
  text: string,
  variant: 'wr-primary' | 'wr-ghost' | 'wr-stop',
  onClick: (button: HTMLButtonElement) => void,
): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = `wr-btn ${variant}`
  el.textContent = text
  el.addEventListener('click', (event) => {
    event.stopPropagation()
    onClick(el)
  })
  return el
}

function label(text: string, className = 'wr-label'): HTMLSpanElement {
  const el = document.createElement('span')
  el.className = className
  el.textContent = text
  return el
}

/** The bar shown while the agent works on this tab. */
export function createAgentBar(input: {
  companionName: string
  onTakeOver: (button: HTMLButtonElement) => void
  onStop: () => void
}): HTMLElement {
  injectStyles()
  const bar = document.createElement('div')
  bar.id = AGENT_BAR_ID
  bar.append(
    label(`${input.companionName} is working`),
    button('Take over', 'wr-primary', input.onTakeOver),
    button('Stop', 'wr-stop', input.onStop),
  )
  return bar
}

/** Shows (or refreshes) the hand-back bar. Agent-supplied text is set as text, never HTML. */
export function showUserBar(
  control: TabControl,
  onHandBack: (button: HTMLButtonElement) => void,
): void {
  injectStyles()
  hideUserBar()
  const bar = document.createElement('div')
  bar.id = USER_BAR_ID
  bar.append(label(USER_BAR_TITLE[control.reason]))
  if (control.message) bar.append(label(control.message, 'wr-detail'))
  bar.append(button('Hand back', 'wr-primary', onHandBack))
  const mount = () => document.documentElement.appendChild(bar)
  if (document.documentElement) mount()
  else document.addEventListener('DOMContentLoaded', mount, { once: true })
}

export function hideUserBar(): void {
  document.getElementById(USER_BAR_ID)?.remove()
}
