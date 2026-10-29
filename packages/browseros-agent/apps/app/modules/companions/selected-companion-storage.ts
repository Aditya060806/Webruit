import { storage } from '@wxt-dev/storage'

/** Matches the server's default built-in; the server also falls back to it for unknown ids. */
export const DEFAULT_COMPANION_ID = 'webruit'

export const selectedCompanionStorage = storage.defineItem<string>(
  'local:webruitSelectedCompanion',
  { fallback: DEFAULT_COMPANION_ID },
)
