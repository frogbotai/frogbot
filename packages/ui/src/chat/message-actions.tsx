export interface MessageActionsProps {
  onCopy?: () => void
  onEdit?: () => void
  onRegenerate?: () => void
  text?: string
}

export function MessageActions({ onCopy, onEdit, onRegenerate, text }: MessageActionsProps) {
  const copy = async () => {
    if (text) await navigator.clipboard.writeText(text)
    onCopy?.()
  }
  return <div className="flex items-center gap-1" aria-label="Message actions">
    {(text != null || onCopy) && <button type="button" onClick={copy} className="rounded px-2 py-1 text-xs hover:bg-muted">Copy</button>}
    {onRegenerate && <button type="button" onClick={onRegenerate} className="rounded px-2 py-1 text-xs hover:bg-muted">Regenerate</button>}
    {onEdit && <button type="button" onClick={onEdit} className="rounded px-2 py-1 text-xs hover:bg-muted">Edit</button>}
  </div>
}
