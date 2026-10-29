import type {
  Companion,
  CreateCompanionInput,
} from '@browseros/shared/schemas/companion'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { type FC, useEffect } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod/v3'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

// Mirrors the limits in @browseros/shared/schemas/companion; the server re-validates.
const formSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(40),
  role: z.string().trim().max(40),
  tagline: z.string().trim().min(1, 'Tagline is required').max(120),
  intro: z.string().trim().max(2000),
  persona: z.string().max(8000),
  effort: z.enum(['quick', 'balanced', 'thorough']),
  apps: z.string(),
  domainsDeny: z.string(),
  starters: z
    .array(
      z.object({
        title: z.string().trim().min(1, 'Title is required').max(60),
        prompt: z.string().trim().min(1, 'Prompt is required').max(2000),
      }),
    )
    .max(6),
})

type FormValues = z.infer<typeof formSchema>

const EMPTY: FormValues = {
  name: '',
  role: '',
  tagline: '',
  intro: '',
  persona: '',
  effort: 'balanced',
  apps: '',
  domainsDeny: '',
  starters: [],
}

function toFormValues(companion: Companion): FormValues {
  return {
    name: companion.name,
    role: companion.role ?? '',
    tagline: companion.tagline,
    intro: companion.intro,
    persona: companion.persona,
    effort: companion.defaults.effort,
    apps: companion.apps.join(', '),
    domainsDeny: (companion.policy.domainsDeny ?? []).join(', '),
    starters: companion.starters.map(({ title, prompt }) => ({
      title,
      prompt,
    })),
  }
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function toCompanionInput(values: FormValues): CreateCompanionInput {
  return {
    name: values.name,
    role: values.role || undefined,
    tagline: values.tagline,
    intro: values.intro,
    persona: values.persona,
    defaults: { effort: values.effort },
    apps: splitList(values.apps),
    policy: { domainsDeny: splitList(values.domainsDeny) },
    starters: values.starters,
  }
}

export interface CompanionEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Null creates a new companion. */
  companion: Companion | null
  saving: boolean
  onSave: (input: CreateCompanionInput) => void
}

export const CompanionEditorDialog: FC<CompanionEditorDialogProps> = ({
  open,
  onOpenChange,
  companion,
  saving,
  onSave,
}) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY,
  })
  const starters = useFieldArray({ control: form.control, name: 'starters' })

  useEffect(() => {
    if (open) form.reset(companion ? toFormValues(companion) : EMPTY)
  }, [open, companion, form])

  const editingBuiltin = companion?.origin === 'builtin'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {companion ? `Edit ${companion.name}` : 'New companion'}
          </DialogTitle>
          <DialogDescription>
            {editingBuiltin
              ? 'Your changes are saved as your own copy. Reset any time to get the original back.'
              : 'A companion is a persona with its own instructions, starter tasks and limits.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) =>
              onSave(toCompanionInput(values)),
            )}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Deal Desk" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Sales" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="tagline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tagline</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="One line shown in the picker"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="intro"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Intro</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormDescription>
                    Shown when a new chat starts.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="persona"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Instructions</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={6}
                      placeholder="How should this companion work? Tone, priorities, steps to always follow."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="effort"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effort</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="quick">Quick</SelectItem>
                        <SelectItem value="balanced">Balanced</SelectItem>
                        <SelectItem value="thorough">Thorough</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="apps"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preferred apps</FormLabel>
                    <FormControl>
                      <Input placeholder="gmail, google_sheets" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="domainsDeny"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Never open these sites</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="example.com, *.example.org"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Comma-separated.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">Starter tasks</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={starters.fields.length >= 6}
                  onClick={() => starters.append({ title: '', prompt: '' })}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add
                </Button>
              </div>
              {starters.fields.map((item, index) => (
                <div
                  key={item.id}
                  className="space-y-2 rounded-lg border border-border/60 p-3"
                >
                  <div className="flex items-start gap-2">
                    <FormField
                      control={form.control}
                      name={`starters.${index}.title`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input placeholder="Button title" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Remove starter"
                      onClick={() => starters.remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <FormField
                    control={form.control}
                    name={`starters.${index}.prompt`}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea
                            rows={2}
                            placeholder="What gets sent when the user clicks it"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
