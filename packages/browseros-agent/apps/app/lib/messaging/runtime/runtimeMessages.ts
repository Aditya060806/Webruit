import type { TabControl } from '@browseros/shared/schemas/conversation-panels'
import { defineExtensionMessaging } from '@webext-core/messaging'

export const RuntimeMessageType = {
  getTabId: 'runtime.getTabId',
  stopAgent: 'runtime.stopAgent',
  getTabControl: 'runtime.getTabControl',
  takeOverTab: 'runtime.takeOverTab',
  handBackTab: 'runtime.handBackTab',
} as const

export interface RuntimeTabIdResponse {
  tabId?: number
}

export interface RuntimeStopAgentData {
  conversationId: string
}

interface RuntimeTakeOverData {
  conversationId?: string
}

interface RuntimeTabControlResponse {
  control: TabControl | null
}

interface RuntimeTabControlResult {
  ok: boolean
  error?: string
}

type RuntimeMessagesProtocol = {
  [RuntimeMessageType.getTabId](): RuntimeTabIdResponse
  [RuntimeMessageType.stopAgent](data: RuntimeStopAgentData): void
  // Webruit: the sender's own tab is the target, so pages can't act on other tabs.
  [RuntimeMessageType.getTabControl](): RuntimeTabControlResponse
  [RuntimeMessageType.takeOverTab](
    data: RuntimeTakeOverData,
  ): RuntimeTabControlResult
  [RuntimeMessageType.handBackTab](): RuntimeTabControlResult
}

const { sendMessage, onMessage } =
  defineExtensionMessaging<RuntimeMessagesProtocol>()

export { onMessage as onRuntimeMessage, sendMessage as sendRuntimeMessage }
