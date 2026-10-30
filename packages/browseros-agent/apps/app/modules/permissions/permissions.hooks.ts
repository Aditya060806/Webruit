/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { PermissionModeId } from '@browseros/shared/schemas/companion'
import type {
  ApprovalResponse,
  PendingApproval,
  PermissionRule,
  PermissionsConfig,
} from '@browseros/shared/schemas/permissions'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { sentry } from '@/lib/sentry/sentry'
import { useAgentServerUrl } from '@/modules/browseros/agent-server-url.hooks'
import { pendingApprovalsStorage } from './pending-approvals-storage'

const PERMISSIONS_QUERY_KEYS = {
  config: (baseUrl: string | null | undefined) =>
    ['permissions', baseUrl] as const,
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: string
  }
  if (!response.ok) {
    throw new Error(body.error ?? `Request failed (${response.status})`)
  }
  return body
}

function useServerBase() {
  const { baseUrl, isLoading, error } = useAgentServerUrl()
  const base = () => {
    if (!baseUrl) throw new Error('Webruit agent server is not available')
    return `${baseUrl}/permissions`
  }
  return { baseUrl, isLoading, error, base }
}

export function usePermissions() {
  const { baseUrl, isLoading, error, base } = useServerBase()
  const query = useQuery({
    queryKey: PERMISSIONS_QUERY_KEYS.config(baseUrl),
    queryFn: () => request<PermissionsConfig>(base()),
    enabled: Boolean(baseUrl) && !isLoading,
  })
  return {
    config: query.data,
    loading: isLoading || query.isLoading,
    error: error ?? query.error,
  }
}

function usePermissionsMutation<TInput>(
  run: (base: string, input: TInput) => Promise<unknown>,
) {
  const { baseUrl, base } = useServerBase()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TInput) => run(base(), input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: PERMISSIONS_QUERY_KEYS.config(baseUrl),
      }),
  })
}

export function useSetPermissionMode() {
  return usePermissionsMutation((base, mode: PermissionModeId) =>
    request(`${base}/mode`, { method: 'PUT', body: JSON.stringify({ mode }) }),
  )
}

export function useUpdateRule() {
  return usePermissionsMutation(
    (base, input: Pick<PermissionRule, 'id' | 'decision'>) =>
      request(`${base}/rules/${encodeURIComponent(input.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ decision: input.decision }),
      }),
  )
}

export function useDeleteRule() {
  return usePermissionsMutation((base, id: string) =>
    request(`${base}/rules/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  )
}

export function useAnswerApproval() {
  return usePermissionsMutation(
    (base, input: { id: string } & ApprovalResponse) =>
      request(`${base}/approvals/${encodeURIComponent(input.id)}`, {
        method: 'POST',
        body: JSON.stringify({ decision: input.decision, scope: input.scope }),
      }),
  )
}

/** Waiting approvals for one conversation, live from extension storage. */
export function usePendingApprovals(conversationId: string | undefined) {
  const [approvals, setApprovals] = useState<PendingApproval[]>([])
  useEffect(() => {
    let active = true
    const unwatch = pendingApprovalsStorage.watch((value) => {
      if (active) setApprovals(value ?? [])
    })
    pendingApprovalsStorage.getValue().then(
      (value) => {
        if (active) setApprovals(value)
      },
      (error) =>
        sentry.captureException(error, {
          extra: { message: 'Failed to read pending approvals' },
        }),
    )
    return () => {
      active = false
      unwatch()
    }
  }, [])
  return approvals.filter(
    (approval) =>
      !approval.conversationId || approval.conversationId === conversationId,
  )
}
