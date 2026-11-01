/**
 * @license
 * Copyright 2026 Webruit
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { MemoryNote } from '@browseros/shared/schemas/memory'
import { zodResolver } from '@hookform/resolvers/zod'
import { Brain, Pencil, Search, Trash2 } from 'lucide-react'
import { type FC, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod/v3'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useSelectedCompanion } from '@/modules/companions/companions.hooks'
import {
  useCreateMemoryNote,
  useDeleteMemoryNote,
  useMemoryNotes,
  useUpdateMemoryNote,
} from '@/modules/memory/memory.hooks'

const NoteFormSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Write the note')
    .max(512, 'Keep it under 512 characters'),
  tags: z
    .string()
    .refine((value) => splitTags(value).length <= 20, 'Use at most 20 tags'),
})

type NoteFormValues = z.infer<typeof NoteFormSchema>

function splitTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
}

const NoteForm: FC<{
  initial?: NoteFormValues
  submitLabel: string
  busy: boolean
  onSubmit: (values: { text: string; tags: string[] }) => Promise<void>
  onCancel?: () => void
}> = ({ initial, submitLabel, busy, onSubmit, onCancel }) => {
  const form = useForm<NoteFormValues>({
    resolver: zodResolver(NoteFormSchema),
    defaultValues: initial ?? { text: '', tags: '' },
  })
  const submit = form.handleSubmit(async (values) => {
    await onSubmit({ text: values.text, tags: splitTags(values.tags) })
    if (!initial) form.reset({ text: '', tags: '' })
  })
  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-3">
        <FormField
          control={form.control}
          name="text"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note</FormLabel>
              <FormControl>
                <Textarea
                  rows={2}
                  placeholder="e.g. I prefer window seats on flights"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tags</FormLabel>
              <FormControl>
                <Input placeholder="travel, seats" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={busy}>
            {submitLabel}
          </Button>
          {onCancel && (
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Form>
  )
}

export const MemoryPage: FC = () => {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const { notes, loading, error } = useMemoryNotes(query)
  const { companions } = useSelectedCompanion()
  const createNote = useCreateMemoryNote()
  const updateNote = useUpdateMemoryNote()
  const deleteNote = useDeleteMemoryNote()

  const scopeLabel = (note: MemoryNote) =>
    note.scope === 'global'
      ? 'All companions'
      : (companions.find((c) => c.id === note.scope)?.name ?? note.scope)

  const fail = (err: unknown): void => {
    toast.error(err instanceof Error ? err.message : String(err))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h2 className="flex items-center gap-2 font-semibold text-xl">
          <Brain className="size-5" /> Memory
        </h2>
        <p className="text-muted-foreground text-sm">
          Short notes the agent keeps about you across chats. Notes that match
          what you ask are shown to the agent with your message. Each note is a
          Markdown file in your Webruit profile folder.
        </p>
      </div>

      <section className="space-y-3 rounded-xl border p-4">
        <h3 className="font-semibold text-base">Add a note</h3>
        <NoteForm
          submitLabel="Save note"
          busy={createNote.isPending}
          onSubmit={(values) =>
            createNote.mutateAsync(values).then(
              () => undefined,
              (err) => fail(err),
            )
          }
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-base">Saved notes</h3>
          <div className="relative ml-auto w-64">
            <Search className="absolute top-2.5 left-2 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search notes"
              className="pl-8"
              aria-label="Search notes"
            />
          </div>
        </div>

        {error ? (
          <p className="text-destructive text-sm">
            Couldn't load memory: {error.message}
          </p>
        ) : loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : notes.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {query
              ? 'No notes match that search.'
              : 'No notes yet. Tell the agent "remember that…" or add one above.'}
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {notes.map((note) => (
              <li key={note.id} className="space-y-2 p-3">
                {editing === note.id ? (
                  <NoteForm
                    initial={{ text: note.text, tags: note.tags.join(', ') }}
                    submitLabel="Save"
                    busy={updateNote.isPending}
                    onCancel={() => setEditing(null)}
                    onSubmit={(values) =>
                      updateNote
                        .mutateAsync({ id: note.id, patch: values })
                        .then(
                          () => setEditing(null),
                          (err) => fail(err),
                        )
                    }
                  />
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {note.text}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
                        {note.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                        <span>{scopeLabel(note)}</span>
                        <span>·</span>
                        <span>
                          {note.author === 'agent'
                            ? 'Saved by the agent'
                            : 'Added by you'}
                        </span>
                        <span>·</span>
                        <span>{note.updatedAt.slice(0, 10)}</span>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditing(note.id)}
                      aria-label="Edit note"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={deleteNote.isPending}
                      onClick={() =>
                        deleteNote.mutate(note.id, { onError: fail })
                      }
                      aria-label="Delete note"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
