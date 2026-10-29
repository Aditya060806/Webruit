import type { Companion } from '@browseros/shared/schemas/companion'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { type FC, useState } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useSelectedCompanion } from '@/modules/companions/companions.hooks'
import { CompanionAvatar } from './CompanionAvatar'

export interface CompanionPickerProps {
  /** Shrinks the trigger to the avatar only, for narrow headers. */
  compact?: boolean
  /** Opens the companion editor; the item is hidden when omitted. */
  onCreate?: () => void
}

function groupCompanions(companions: Companion[]) {
  return [
    {
      key: 'builtin',
      label: 'Companions',
      items: companions.filter((c) => c.origin === 'builtin'),
    },
    {
      key: 'mine',
      label: 'Yours',
      items: companions.filter((c) => c.origin !== 'builtin'),
    },
  ].filter((group) => group.items.length > 0)
}

export const CompanionPicker: FC<CompanionPickerProps> = ({
  compact = false,
  onCreate,
}) => {
  const [open, setOpen] = useState(false)
  const { companions, selected, setCompanionId, loading } =
    useSelectedCompanion()

  if (!selected) {
    return (
      <span className="inline-flex h-8 w-8 animate-pulse rounded-lg bg-muted/60">
        <span className="sr-only">
          {loading ? 'Loading companions' : 'No companions'}
        </span>
      </span>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`Companion: ${selected.name}`}
          className="group inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-1.5 py-1 text-foreground transition-colors hover:bg-muted/50 data-[state=open]:bg-accent"
        >
          <CompanionAvatar companion={selected} size="xs" />
          {!compact && (
            <span className="max-w-[96px] truncate font-medium text-sm">
              {selected.name}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search companions..." className="h-9" />
          <CommandList>
            <CommandEmpty>No companion found</CommandEmpty>
            {groupCompanions(companions).map((group) => (
              <CommandGroup key={group.key} heading={group.label}>
                {group.items.map((companion) => {
                  const isSelected = companion.id === selected.id
                  return (
                    <CommandItem
                      key={companion.id}
                      value={`${companion.name} ${companion.role ?? ''} ${companion.tagline}`}
                      onSelect={() => {
                        setCompanionId(companion.id)
                        setOpen(false)
                      }}
                      className="flex items-start gap-2.5 py-2"
                    >
                      <CompanionAvatar companion={companion} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-medium text-sm">
                            {companion.name}
                          </span>
                          {companion.role && (
                            <span className="truncate text-[11px] text-muted-foreground">
                              {companion.role}
                            </span>
                          )}
                        </span>
                        <span className="line-clamp-2 text-muted-foreground text-xs">
                          {companion.tagline}
                        </span>
                      </span>
                      <Check
                        className={cn(
                          'mt-1 h-4 w-4 shrink-0',
                          isSelected ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
            {onCreate && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value="create new companion"
                    onSelect={() => {
                      setOpen(false)
                      onCreate()
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    New companion
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
