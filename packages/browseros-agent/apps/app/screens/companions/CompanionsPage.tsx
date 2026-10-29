import type {
  Companion,
  CreateCompanionInput,
} from '@browseros/shared/schemas/companion'
import { Check, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { CompanionAvatar } from '@/components/companions/CompanionAvatar'
import { Button } from '@/components/ui/button'
import { sentry } from '@/lib/sentry/sentry'
import {
  useCreateCompanion,
  useDeleteCompanion,
  useSelectedCompanion,
  useUpdateCompanion,
} from '@/modules/companions/companions.hooks'
import { CompanionEditorDialog } from './CompanionEditorDialog'

/** Lists, creates, edits and resets companions. `?new=1` opens the editor straight away. */
export const CompanionsPage: FC = () => {
  const { companions, selected, setCompanionId, loading, error } =
    useSelectedCompanion()
  const createCompanion = useCreateCompanion()
  const updateCompanion = useUpdateCompanion()
  const deleteCompanion = useDeleteCompanion()
  const [searchParams, setSearchParams] = useSearchParams()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Companion | null>(null)

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditing(null)
      setEditorOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const reportError = (message: string) => (err: unknown) => {
    sentry.captureException(err, { extra: { message } })
    toast.error(err instanceof Error ? err.message : message)
  }

  const save = (input: CreateCompanionInput) => {
    const options = {
      onSuccess: (companion: Companion) => {
        setEditorOpen(false)
        toast.success(`${companion.name} saved`)
      },
      onError: reportError('Failed to save companion'),
    }
    if (editing) {
      updateCompanion.mutate({ companionId: editing.id, patch: input }, options)
    } else {
      createCompanion.mutate(input, {
        ...options,
        onSuccess: (companion) => {
          options.onSuccess(companion)
          setCompanionId(companion.id)
        },
      })
    }
  }

  const remove = (companion: Companion) => {
    const isOverride = companion.origin === 'builtin'
    const question = isOverride
      ? `Reset ${companion.name} to the original version?`
      : `Delete ${companion.name}? This removes its folder.`
    if (!window.confirm(question)) return
    deleteCompanion.mutate(companion.id, {
      onSuccess: () => {
        if (!isOverride && selected?.id === companion.id)
          setCompanionId('webruit')
        toast.success(
          isOverride ? `${companion.name} reset` : `${companion.name} deleted`,
        )
      },
      onError: reportError('Failed to delete companion'),
    })
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl">Companions</h1>
          <p className="text-muted-foreground text-sm">
            Pick who you work with in the side panel, or make your own.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setEditorOpen(true)
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" /> New companion
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          Couldn't load companions. Is the Webruit agent server running?
        </p>
      )}
      {loading && <p className="text-muted-foreground text-sm">Loading…</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {companions.map((companion) => {
          const isSelected = selected?.id === companion.id
          return (
            <div
              key={companion.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-start gap-3">
                <CompanionAvatar companion={companion} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {companion.name}
                    </span>
                    {companion.role && (
                      <span className="truncate text-muted-foreground text-xs">
                        {companion.role}
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 text-muted-foreground text-xs">
                    {companion.tagline}
                  </p>
                </div>
              </div>
              <div className="mt-auto flex items-center gap-1">
                <Button
                  size="sm"
                  variant={isSelected ? 'secondary' : 'outline'}
                  disabled={isSelected}
                  onClick={() => setCompanionId(companion.id)}
                >
                  {isSelected ? (
                    <>
                      <Check className="mr-1 h-3.5 w-3.5" /> In use
                    </>
                  ) : (
                    'Use'
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title="Edit"
                  onClick={() => {
                    setEditing(companion)
                    setEditorOpen(true)
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {!companion.readOnly && (
                  <Button
                    size="sm"
                    variant="ghost"
                    title={
                      companion.origin === 'builtin'
                        ? 'Reset to original'
                        : 'Delete'
                    }
                    onClick={() => remove(companion)}
                  >
                    {companion.origin === 'builtin' ? (
                      <RotateCcw className="h-3.5 w-3.5" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <CompanionEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        companion={editing}
        saving={createCompanion.isPending || updateCompanion.isPending}
        onSave={save}
      />
    </div>
  )
}
