import { useState } from 'react'
import type { NotionMapCell, NotionMapTopic } from '../../../shared/dashboard'
import {
  cellDescription,
  heatLegend,
  heatLevel,
  heatSymbols,
  percentOrDash,
  timeSince,
  trendLabel
} from './dashboardText'

/** Colour, symbol and score: a level never relies on colour alone. */
export function HeatLegend({ threshold }: { threshold: number }) {
  return (
    <ul className="dash-legend" aria-label="Notion Map legend">
      {heatLegend(threshold).map(({ level, label }) => (
        <li key={level}>
          <span className={`dash-swatch label-mono heat-${level}`} aria-hidden="true">
            {heatSymbols[level]}
          </span>
          <span>{label}</span>
        </li>
      ))}
    </ul>
  )
}

function CellDetails({ cell }: { cell: NotionMapCell }) {
  return (
    <div className="dash-cell-details" data-testid="notion-details">
      <strong lang="fr">{cell.title}</strong>
      <ul>
        <li>
          Latest score: {percentOrDash(cell.latestScorePercent)} (
          {cell.latestScorePercent === null
            ? 'not tested yet'
            : cell.mastered
              ? 'mastered'
              : 'not mastered'}
          )
        </li>
        <li>
          Scores by round:{' '}
          {cell.scores.length === 0 ? 'none yet' : cell.scores.map(percentOrDash).join(' → ')}
        </li>
        <li>Trend: {trendLabel(cell.trend)}</li>
        <li>Attempts: {cell.attemptCount}</li>
        <li>Last practiced: {timeSince(cell.lastPracticedAt)}</li>
      </ul>
    </div>
  )
}

/**
 * The Notion Map of one topic: a heat grid, one cell per notion of its Notion Outline, coloured
 * by its latest score with the score and a symbol written in the cell. A cell is a button that
 * shows its details under the grid.
 */
export function NotionMapGrid({ map }: { map: NotionMapTopic }) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selected = map.notions.find((cell) => cell.id === selectedId) ?? null
  const headingId = `notion-map-${map.topicId}`
  return (
    <section className="card dash-map-topic" aria-labelledby={headingId} data-topic={map.slug}>
      <h3 id={headingId}>{map.title}</h3>
      <ul className="dash-grid" aria-label={`Notions of ${map.title}`}>
        {map.notions.map((cell) => {
          const level = heatLevel(cell)
          return (
            <li key={cell.id}>
              <button
                type="button"
                className="dash-cell"
                aria-label={cellDescription(cell)}
                aria-pressed={cell.id === selectedId}
                title={cellDescription(cell)}
                data-testid="notion-cell"
                data-level={level}
                onClick={() => setSelectedId(cell.id === selectedId ? null : cell.id)}
              >
                <span className="dash-cell-title" lang="fr">
                  {cell.title}
                </span>
                <span className={`dash-cell-score label-mono heat-${level}`} aria-hidden="true">
                  {heatSymbols[level]} {percentOrDash(cell.latestScorePercent)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {selected && <CellDetails cell={selected} />}
    </section>
  )
}
