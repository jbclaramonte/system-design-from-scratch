import { useEffect, useRef, useState } from 'react'

/**
 * Plain-text label that turns into a field on double-click. Enter commits (Cmd/Ctrl+Enter in a
 * multi-line field), Escape cancels, leaving the field commits. React Flow has no text editing,
 * so the canvas brings its own.
 */
export function EditableText({
  value,
  onCommit,
  onStart,
  multiline = false,
  placeholder,
  className,
  color,
  label
}: {
  value: string
  onCommit: (value: string) => void
  /** Called when editing starts, before any change (take the undo snapshot here). */
  onStart?: () => void
  multiline?: boolean
  placeholder?: string
  className?: string
  /** Text color, when it must not come from the stylesheet (the light export). */
  color?: string
  /** Accessible name of the field. */
  label: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const editing = draft !== null

  useEffect(() => {
    if (editing) {
      field.current?.focus()
      field.current?.select()
    }
  }, [editing])

  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft)
    setDraft(null)
  }

  if (!editing) {
    return (
      <div
        className={`flow-text ${className ?? ''}`}
        style={color ? { color } : undefined}
        onDoubleClick={() => {
          onStart?.()
          setDraft(value)
        }}
      >
        {value || <span className="flow-text-placeholder">{placeholder}</span>}
      </div>
    )
  }

  const props = {
    ref: field,
    value: draft,
    'aria-label': label,
    className: `flow-text-field nodrag nowheel nopan ${className ?? ''}`,
    onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
    onBlur: commit,
    onKeyDown: (event: React.KeyboardEvent) => {
      event.stopPropagation()
      if (event.key === 'Escape') setDraft(null)
      else if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) commit()
    }
  }
  return multiline ? <textarea {...props} rows={3} /> : <input {...props} />
}
