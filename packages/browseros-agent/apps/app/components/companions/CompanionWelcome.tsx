import { ArrowRight } from 'lucide-react'
import type { FC } from 'react'
import { useSelectedCompanion } from '@/modules/companions/companions.hooks'
import { CompanionAvatar } from './CompanionAvatar'

export interface CompanionWelcomeProps {
  onStarterClick: (prompt: string) => void
}

/** Empty-chat header for agent mode: who you're working with and what they're good at. */
export const CompanionWelcome: FC<CompanionWelcomeProps> = ({
  onStarterClick,
}) => {
  const { selected } = useSelectedCompanion()
  if (!selected) return null

  return (
    <div className="flex w-full max-w-[320px] flex-col items-center gap-3">
      <CompanionAvatar companion={selected} size="lg" />
      <div>
        <h2 className="mb-1 font-semibold text-lg">{selected.name}</h2>
        <p className="text-muted-foreground text-xs">
          {selected.intro || selected.tagline}
        </p>
      </div>
      {selected.starters.length > 0 && (
        <div className="mt-2 flex w-full flex-col gap-2">
          {selected.starters.map((starter) => (
            <button
              type="button"
              key={starter.title}
              onClick={() => onStarterClick(starter.prompt)}
              className="group flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ borderColor: `${selected.avatar.palette.primary}55` }}
            >
              <span className="min-w-0 flex-1 break-words font-medium">
                {starter.title}
              </span>
              <ArrowRight
                aria-hidden="true"
                className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
