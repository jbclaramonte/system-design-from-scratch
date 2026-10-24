import type { BadgeIconName } from '../../../shared/rewards'

const paths: Record<BadgeIconName, string> = {
  // A sprout.
  seedling:
    'M12 20v-8M12 12c0-3.5 2.5-5.5 6-5.5 0 3.5-2.5 5.5-6 5.5zM12 14c0-3-2-4.5-5-4.5 0 3 2 4.5 5 4.5z',
  // Stacked layers.
  layers: 'M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4',
  // A target.
  target: 'M12 20a8 8 0 100-16 8 8 0 000 16zM12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM12 12h.01',
  // A bounce back up.
  rebound: 'M5 7v4a4 4 0 004 4h6M15 15l4-4M15 15l4 4M5 7h.01',
  // A flame.
  flame:
    'M12 20c-3.3 0-5.5-2.2-5.5-5 0-2.6 2-4 3-6.5 1.2 1 1.7 2 1.8 3.2.9-.8 1.5-2 1.5-3.7 2.5 1.8 4.7 4.3 4.7 7 0 2.8-2.2 5-5.5 5z',
  // A blueprint sheet with a grid.
  blueprint: 'M5 5h14v14H5zM5 10h14M10 5v14'
}

/** The glyph of a Badge. Decorative: the title and the status are written next to it. */
export function BadgeIcon({ name }: { name: BadgeIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}

/** The lock drawn on a locked Badge. */
export function LockGlyph() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7.5 9V7.7a2.5 2.5 0 015 0V9M7 9h6v4.5H7z" />
    </svg>
  )
}
