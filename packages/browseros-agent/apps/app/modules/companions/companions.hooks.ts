import type { CompanionRoutes } from '@browseros/server'
import type {
  Companion,
  CreateCompanionInput,
  UpdateCompanionInput,
} from '@browseros/shared/schemas/companion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { hc } from 'hono/client'
import { useEffect, useState } from 'react'
import { sentry } from '@/lib/sentry/sentry'
import { useAgentServerUrl } from '@/modules/browseros/agent-server-url.hooks'
import {
  DEFAULT_COMPANION_ID,
  selectedCompanionStorage,
} from './selected-companion-storage'

export const COMPANION_QUERY_KEYS = {
  all: (baseUrl: string | null | undefined) => ['companions', baseUrl] as const,
}

function companionsClient(baseUrl: string) {
  return hc<CompanionRoutes>(`${baseUrl}/companions`)
}

export function useCompanions() {
  const {
    baseUrl,
    isLoading: urlLoading,
    error: urlError,
  } = useAgentServerUrl()
  const query = useQuery({
    queryKey: COMPANION_QUERY_KEYS.all(baseUrl),
    queryFn: async (): Promise<Companion[]> => {
      const response = await companionsClient(baseUrl as string).index.$get()
      if (!response.ok) {
        throw new Error(`Failed to load companions (${response.status})`)
      }
      const body = await response.json()
      return body.companions as Companion[]
    },
    enabled: Boolean(baseUrl) && !urlLoading,
    staleTime: 30_000,
  })
  return {
    companions: query.data ?? [],
    loading: urlLoading || query.isLoading,
    // When the server URL can't be resolved the query never runs, so its own error stays null.
    error: urlError ?? query.error,
  }
}

/** The selected id is shared by every extension surface (side panel, new tab) through extension storage. */
export function useSelectedCompanionId() {
  const [companionId, setCompanionIdState] = useState(DEFAULT_COMPANION_ID)

  useEffect(() => {
    let active = true
    let changed = false
    // Subscribe before reading so a slow read can't overwrite a newer change.
    const unwatch = selectedCompanionStorage.watch((value) => {
      changed = true
      if (active) setCompanionIdState(value ?? DEFAULT_COMPANION_ID)
    })
    selectedCompanionStorage.getValue().then(
      (value) => {
        if (active && !changed) setCompanionIdState(value)
      },
      (error) =>
        sentry.captureException(error, {
          extra: { message: 'Failed to read selected companion' },
        }),
    )
    return () => {
      active = false
      unwatch()
    }
  }, [])

  const setCompanionId = (id: string) => {
    setCompanionIdState(id)
    selectedCompanionStorage.setValue(id).catch((error) =>
      sentry.captureException(error, {
        extra: { message: 'Failed to save selected companion', id },
      }),
    )
  }

  return { companionId, setCompanionId }
}

export function useSelectedCompanion() {
  const { companions, loading, error } = useCompanions()
  const { companionId, setCompanionId } = useSelectedCompanionId()
  const selected =
    companions.find((c) => c.id === companionId) ??
    companions.find((c) => c.id === DEFAULT_COMPANION_ID) ??
    null
  return { companions, selected, setCompanionId, loading, error }
}

async function requestError(response: {
  status: number
  json: () => Promise<unknown>
}): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  return new Error(
    body.error ?? `Request failed with status ${response.status}`,
  )
}

function useCompanionMutationBase() {
  const { baseUrl } = useAgentServerUrl()
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: COMPANION_QUERY_KEYS.all(baseUrl),
    })
  const client = () => {
    if (!baseUrl) throw new Error('Webruit agent server is not available')
    return companionsClient(baseUrl)
  }
  return { client, invalidate }
}

export function useCreateCompanion() {
  const { client, invalidate } = useCompanionMutationBase()
  return useMutation({
    mutationFn: async (input: CreateCompanionInput): Promise<Companion> => {
      const response = await client().index.$post({ json: input })
      if (!response.ok) throw await requestError(response)
      return (await response.json()).companion as Companion
    },
    onSuccess: invalidate,
  })
}

export function useUpdateCompanion() {
  const { client, invalidate } = useCompanionMutationBase()
  return useMutation({
    mutationFn: async ({
      companionId,
      patch,
    }: {
      companionId: string
      patch: UpdateCompanionInput
    }): Promise<Companion> => {
      const response = await client()[':companionId'].$patch({
        param: { companionId },
        json: patch,
      })
      if (!response.ok) throw await requestError(response)
      return (await response.json()).companion as Companion
    },
    onSuccess: invalidate,
  })
}

/** For a built-in this resets it to the shipped version; for a user companion it removes it. */
export function useDeleteCompanion() {
  const { client, invalidate } = useCompanionMutationBase()
  return useMutation({
    mutationFn: async (companionId: string) => {
      const response = await client()[':companionId'].$delete({
        param: { companionId },
      })
      if (!response.ok) throw await requestError(response)
    },
    onSuccess: invalidate,
  })
}
