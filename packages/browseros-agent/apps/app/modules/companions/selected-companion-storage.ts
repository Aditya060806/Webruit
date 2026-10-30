import { storage } from '@wxt-dev/storage'

/** Matches the server's default built-in; the server also falls back to it for unknown ids. */
export const DEFAULT_COMPANION_ID = 'webruit'

export const selectedCompanionStorage = storage.defineItem<string>(
  'local:webruitSelectedCompanion',
  { fallback: DEFAULT_COMPANION_ID },
)

/** Display name of the selected companion, for page overlays that can't call the server. */
export const selectedCompanionNameStorage = storage.defineItem<string>(
  'local:webruitSelectedCompanionName',
  { fallback: 'Webruit' },
)
