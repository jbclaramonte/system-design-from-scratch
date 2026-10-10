import type { LessonSource } from '../../../shared/lesson'
import { shortSourceLabel } from './citations'

/** Sources footer of a finished lesson: the primer excerpts it cites, with the CC BY 4.0 notice. */
export function LessonSources({ sources }: { sources: LessonSource[] }) {
  if (sources.length === 0) return null
  return (
    <footer className="lesson-sources">
      <h3>Sources</h3>
      <p>
        Excerpts of the{' '}
        <a
          href="https://github.com/donnemartin/system-design-primer"
          target="_blank"
          rel="noreferrer"
        >
          System Design Primer
        </a>{' '}
        (
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
          CC BY 4.0
        </a>
        ), adapted and translated by a generated lesson:
      </p>
      <ul>
        {sources.map((source) => (
          <li key={source.sectionId}>
            <a href={source.url} target="_blank" rel="noreferrer" title={source.label}>
              {shortSourceLabel(source.label)}
            </a>{' '}
            <code>{source.sectionId}</code>
          </li>
        ))}
      </ul>
    </footer>
  )
}
