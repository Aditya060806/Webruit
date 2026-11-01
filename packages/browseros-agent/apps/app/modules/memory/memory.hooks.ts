/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type {
  CreateMemoryNoteInput,
  MemoryNote,
  UpdateMemoryNoteInput,
} from '@browseros/shared/schemas/memory'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAgentServerUrl } from '@/modules/browseros/agent-server-url.hooks'

const MEMORY_QUERY_KEYS = {
  all: (baseUrl: string | null | undefined) => ['memory', baseUrl] as const,
  list: (baseUrl: string | null | undefined, query: string) =>
    ['memory', baseUrl, query] as const,
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: unknown
  }
  if (!response.ok) {
    const message =
      typeof body.error === 'string'
        ? body.error
        : `Request failed (${response.status})`
    throw new Error(message)
  }
  return body
}

export function useMemoryNotes(query: string) {
  const { baseUrl, isLoading, error } = useAgentServerUrl()
  const result = useQuery({
    queryKey: MEMORY_QUERY_KEYS.list(baseUrl, query),
    queryFn: () =>
      request<{ notes: MemoryNote[] }>(
        `${baseUrl}/memory${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`,
      ).then((body) => body.notes),
    enabled: Boolean(baseUrl) && !isLoading,
  })
  return {
    notes: result.data ?? [],
    loading: isLoading || result.isLoading,
    error: error ?? result.error,
  }
}

function useMemoryMutation<TInput>(
  run: (base: string, input: TInput) => Promise<unknown>,
) {
  const { baseUrl } = useAgentServerUrl()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TInput) => {
      if (!baseUrl) throw new Error('Webruit agent server is not available')
      return run(`${baseUrl}/memory`, input)
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: MEMORY_QUERY_KEYS.all(baseUrl),
      }),
  })
}

export function useCreateMemoryNote() {
  return useMemoryMutation((base, input: CreateMemoryNoteInput) =>
    request(base, { method: 'POST', body: JSON.stringify(input) }),
  )
}

export function useUpdateMemoryNote() {
  return useMemoryMutation(
    (base, input: { id: string; patch: UpdateMemoryNoteInput }) =>
      request(`${base}/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify(input.patch),
      }),
  )
}

export function useDeleteMemoryNote() {
  return useMemoryMutation((base, id: string) =>
    request(`${base}/${id}`, { method: 'DELETE' }),
  )
}
