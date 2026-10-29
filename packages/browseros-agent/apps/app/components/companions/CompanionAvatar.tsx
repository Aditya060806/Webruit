import type { Companion } from '@browseros/shared/schemas/companion'
import type { FC } from 'react'
import { cn } from '@/lib/utils'

export interface CompanionAvatarProps {
  companion: Pick<Companion, 'name' | 'avatar'>
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Pulses the accent ring while the companion is working. */
  active?: boolean
  className?: string
}

const SIZES = {
  xs: 'h-5 w-5 text-[10px] rounded-md',
  sm: 'h-7 w-7 text-xs rounded-lg',
  md: 'h-10 w-10 text-base rounded-xl',
  lg: 'h-14 w-14 text-2xl rounded-2xl',
} as const

/** Webruit's glyph avatar: a letter on a two-tone tile with an accent corner. */
export const CompanionAvatar: FC<CompanionAvatarProps> = ({
  companion,
  size = 'sm',
  active = false,
  className,
}) => {
  const { palette, glyph } = companion.avatar
  const letter = glyph ?? companion.name.charAt(0).toUpperCase()
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden font-semibold text-white',
        SIZES[size],
        active && 'animate-pulse ring-2 ring-offset-1 ring-offset-background',
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(135deg, ${palette.primary} 0%, ${palette.secondary} 100%)`,
        ...(active ? { ['--tw-ring-color' as string]: palette.accent } : {}),
      }}
    >
      <span
        className="absolute top-0 right-0 h-1/3 w-1/3 rounded-bl-full opacity-90"
        style={{ backgroundColor: palette.accent }}
      />
      <span className="relative">{letter}</span>
    </span>
  )
}
