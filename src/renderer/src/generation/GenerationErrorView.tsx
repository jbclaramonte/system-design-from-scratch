import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useOpenSettings } from '../settings/openSettings'
import {
  generationErrorText,
  truncateDetails,
  type DisplayedErrorCode
} from './generationErrorText'
import './generation.css'

/**
 * The raw message, folded: a read-only text area (select all on focus) and a Copy button. The
 * clipboard API is tried first; the main process denies every permission request except
 * sanitized clipboard writes (`isAllowedPermission`, src/main/security.ts). If the write is
 * refused anyway, the text stays selected for a manual copy.
 */
function TechnicalDetails({ message }: { message: string }) {
  const text = truncateDetails(message)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const [copy, setCopy] = useState<'copied' | 'selected' | null>(null)

  const selectAll = () => {
    areaRef.current?.focus()
    areaRef.current?.select()
    // Deprecated but permission-free, and kept by Chromium for this use.
    setCopy(document.execCommand('copy') ? 'copied' : 'selected')
  }
  const copyText = () => {
    if (!navigator.clipboard) return selectAll()
    navigator.clipboard.writeText(text).then(() => setCopy('copied'), selectAll)
  }

  return (
    <details data-testid="error-details">
      <summary>Technical details</summary>
      <textarea
        ref={areaRef}
        readOnly
        value={text}
        rows={6}
        aria-label="Technical details"
        data-testid="error-details-text"
        className="generation-details-text"
        onFocus={(event) => event.currentTarget.select()}
      />
      <div className="generation-details-actions">
        <button
          type="button"
          className="btn-sm"
          data-testid="error-details-copy"
          onClick={copyText}
        >
          Copy
        </button>
        {copy && (
          <span role="status" className="muted">
            {copy === 'copied' ? 'Copied.' : 'Selected: press Cmd+C (Ctrl+C) to copy.'}
          </span>
        )}
      </div>
    </details>
  )
}

/**
 * Every Generation error of the app: a title and plain advice by error code, "Open Settings" when
 * Settings can fix it, Retry and the screen's own actions, then the raw message folded under
 * "Technical details". The raw message is also logged to the console, so it is never lost.
 */
export function GenerationErrorView({
  code,
  message,
  title,
  hint,
  onRetry,
  retryTestId,
  testId,
  children
}: {
  code: DisplayedErrorCode
  /** The raw message (CLI output included), shown folded. */
  message: string
  /** Replaces the title of the code, for a screen that names what failed. */
  title?: string
  /** What to do next on this screen, after the advice (for example "Your work is kept."). */
  hint?: string
  onRetry?: () => void
  retryTestId?: string
  testId: string
  /** More actions, after Retry. */
  children?: ReactNode
}) {
  const openSettings = useOpenSettings()
  const text = generationErrorText(code, message)
  const cancelled = code === 'cancelled'
  const showSettings = text.openSettings && !!openSettings

  useEffect(() => {
    if (!cancelled) console.error(`Generation error (${code}): ${message}`)
  }, [cancelled, code, message])

  return (
    <div
      className={cancelled ? 'lesson-notice' : 'lesson-error'}
      role="alert"
      data-testid={testId}
      data-code={code}
    >
      <strong>{title ?? text.title}</strong>
      <p data-testid="error-advice">
        {text.advice}
        {hint && ` ${hint}`}
      </p>
      {(showSettings || onRetry || children) && (
        <div className="generation-error-actions">
          {showSettings && (
            <span className="settings-error-action" data-testid="settings-error-action">
              <button type="button" data-testid="open-settings-from-error" onClick={openSettings}>
                Open Settings
              </button>
            </span>
          )}
          {onRetry && (
            <button type="button" onClick={onRetry} data-testid={retryTestId}>
              Retry
            </button>
          )}
          {children}
        </div>
      )}
      {!cancelled && code !== 'refused' && message.trim() && <TechnicalDetails message={message} />}
    </div>
  )
}
