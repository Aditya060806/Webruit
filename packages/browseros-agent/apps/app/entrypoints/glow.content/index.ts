import type { TabControl } from '@browseros/shared/schemas/conversation-panels'
import confetti from 'canvas-confetti'
import {
  RuntimeMessageType,
  sendRuntimeMessage,
} from '@/lib/messaging/runtime/runtimeMessages'
import {
  TAB_CONTROL_MESSAGE_TYPE,
  type TabControlMessage,
} from '@/lib/tab-control/tab-control-bridge'
import { selectedCompanionNameStorage } from '@/modules/companions/selected-companion-storage'
import { createAgentBar, hideUserBar, showUserBar } from './control-bar'
import type { GlowMessage } from './GlowMessage'

const GLOW_OVERLAY_ID = 'browseros-glow-overlay'
const GLOW_STYLES_ID = 'browseros-glow-styles'

const GLOW_THICKNESS = 1.0
const GLOW_OPACITY = 0.6

let activeConversationId: string | null = null
// Webruit: set while the user holds this tab; the glow stays off until they hand back.
let control: TabControl | null = null

function injectStyles(): void {
  if (document.getElementById(GLOW_STYLES_ID)) {
    return
  }

  const t = GLOW_THICKNESS

  const style = document.createElement('style')
  style.id = GLOW_STYLES_ID
  style.textContent = `
    @keyframes browseros-glow-pulse {
      0% {
        box-shadow:
          inset 0 0 ${58 * t}px ${26 * t}px transparent,
          inset 0 0 ${50 * t}px ${22 * t}px rgba(251, 102, 24, 0.06),
          inset 0 0 ${42 * t}px ${18 * t}px rgba(251, 102, 24, 0.12),
          inset 0 0 ${34 * t}px ${14 * t}px rgba(251, 102, 24, 0.18);
      }
      50% {
        box-shadow:
          inset 0 0 ${72 * t}px ${35 * t}px transparent,
          inset 0 0 ${64 * t}px ${32 * t}px rgba(251, 102, 24, 0.10),
          inset 0 0 ${54 * t}px ${26 * t}px rgba(251, 102, 24, 0.18),
          inset 0 0 ${46 * t}px ${22 * t}px rgba(251, 102, 24, 0.24);
      }
      100% {
        box-shadow:
          inset 0 0 ${58 * t}px ${26 * t}px transparent,
          inset 0 0 ${50 * t}px ${22 * t}px rgba(251, 102, 24, 0.06),
          inset 0 0 ${42 * t}px ${18 * t}px rgba(251, 102, 24, 0.12),
          inset 0 0 ${34 * t}px ${14 * t}px rgba(251, 102, 24, 0.18);
      }
    }

    @keyframes browseros-glow-fade-in {
      from { opacity: 0; }
      to { opacity: ${GLOW_OPACITY}; }
    }

    #${GLOW_OVERLAY_ID} {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
      opacity: 0;
      will-change: opacity;
      animation:
        browseros-glow-pulse 3s ease-in-out infinite,
        browseros-glow-fade-in 420ms cubic-bezier(0.22, 1, 0.36, 1) forwards !important;
    }
  `
  const appendStyle = () => document.head.appendChild(style)

  if (document.head) {
    appendStyle()
  } else {
    document.addEventListener('DOMContentLoaded', appendStyle, { once: true })
  }
}

function startGlow(): void {
  stopGlow()
  injectStyles()

  const overlay = document.createElement('div')
  overlay.id = GLOW_OVERLAY_ID

  const bar = createAgentBar({
    companionName,
    onTakeOver: (button) => void takeOver(button),
    onStop: () => {
      if (activeConversationId) {
        void sendRuntimeMessage(RuntimeMessageType.stopAgent, {
          conversationId: activeConversationId,
        })
      }
    },
  })

  overlay.appendChild(bar)

  const appendOverlay = () => document.body.appendChild(overlay)

  if (document.body) {
    appendOverlay()
  } else {
    document.addEventListener('DOMContentLoaded', appendOverlay, { once: true })
  }
}

function fireConfetti(): void {
  const colors = ['#fb6618', '#ff8a4c', '#fbbf24', '#34d399', '#60a5fa']
  const defaults = { colors, ticks: 200, gravity: 1.2, decay: 0.94 }

  confetti({
    ...defaults,
    particleCount: 80,
    spread: 70,
    origin: { x: 0.3, y: 0.6 },
    angle: 60,
  })
  confetti({
    ...defaults,
    particleCount: 80,
    spread: 70,
    origin: { x: 0.7, y: 0.6 },
    angle: 120,
  })

  setTimeout(() => {
    confetti({
      ...defaults,
      particleCount: 60,
      spread: 100,
      origin: { x: 0.5, y: 0.7 },
    })
  }, 150)

  setTimeout(() => {
    confetti({
      ...defaults,
      particleCount: 40,
      spread: 120,
      origin: { x: 0.4, y: 0.65 },
      angle: 75,
    })
    confetti({
      ...defaults,
      particleCount: 40,
      spread: 120,
      origin: { x: 0.6, y: 0.65 },
      angle: 105,
    })
  }, 350)
}

function stopGlow(): void {
  const overlay = document.getElementById(GLOW_OVERLAY_ID)
  if (overlay) {
    overlay.remove()
  }
}

let companionName = 'Webruit'

/** Optimistic: the server blocks the agent before replying, so the bar can switch on success. */
async function takeOver(button: HTMLButtonElement): Promise<void> {
  button.disabled = true
  const result = await sendRuntimeMessage(RuntimeMessageType.takeOverTab, {
    conversationId: activeConversationId ?? undefined,
  }).catch(() => ({ ok: false }))
  button.disabled = false
  if (!result.ok) return
  applyControl({
    mode: 'user',
    reason: 'take_over',
    ...(activeConversationId && { conversationId: activeConversationId }),
    since: new Date().toISOString(),
  })
}

async function handBack(button: HTMLButtonElement): Promise<void> {
  button.disabled = true
  const result = await sendRuntimeMessage(
    RuntimeMessageType.handBackTab,
    undefined,
  ).catch(() => ({ ok: false }))
  button.disabled = false
  if (result.ok) applyControl(null)
}

function applyControl(next: TabControl | null): void {
  control = next
  if (control) {
    stopGlow()
    showUserBar(control, (button) => void handBack(button))
    return
  }
  hideUserBar()
  if (activeConversationId && !document.hidden) startGlow()
}

function isTabControlMessage(message: unknown): message is TabControlMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === TAB_CONTROL_MESSAGE_TYPE
  )
}

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_start',
  main() {
    void selectedCompanionNameStorage.getValue().then(
      (name) => {
        companionName = name
      },
      () => undefined,
    )
    selectedCompanionNameStorage.watch((name) => {
      companionName = name ?? 'Webruit'
    })

    // Control outlives navigation (e.g. sign-in redirects), so each page load asks for it.
    void sendRuntimeMessage(RuntimeMessageType.getTabControl, undefined).then(
      (response) => {
        if (response.control) applyControl(response.control)
      },
      () => undefined,
    )

    browser.runtime.onMessage.addListener(
      (message: GlowMessage | TabControlMessage, _sender, sendResponse) => {
        if (isTabControlMessage(message)) {
          applyControl(message.control)
          sendResponse({ success: true })
          return true
        }
        if (
          typeof message !== 'object' ||
          !('conversationId' in message) ||
          !('isActive' in message)
        ) {
          return
        }

        if (message.isActive) {
          activeConversationId = message.conversationId
          if (!control) startGlow()
        } else if (message.conversationId === activeConversationId) {
          activeConversationId = null
          stopGlow()
          if (message.showConfetti) {
            fireConfetti()
          }
        }

        sendResponse({ success: true })
        return true
      },
    )

    window.addEventListener('beforeunload', stopGlow)

    document.addEventListener('visibilitychange', () => {
      // If user navigates away from the tab, remove the glow overlay - no need to re-enable it when they return
      if (document.hidden) {
        stopGlow()
      }
    })
  },
})
