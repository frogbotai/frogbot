export interface MessageActionsProps {
  onCopy?: () => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
  text?: string;
}

export function MessageActions({ onCopy, onEdit, onRegenerate, text }: MessageActionsProps) {
  const copy = async () => {
    if (text) await navigator.clipboard.writeText(text);
    onCopy?.();
  };
  return (
    <div className="fb-message-actions" aria-label="Message actions">
      {(text != null || onCopy) && (
        <button type="button" onClick={copy} className="fb-message-actions__button">
          Copy
        </button>
      )}
      {onRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          className="fb-message-actions__button"
        >
          Regenerate
        </button>
      )}
      {onEdit && (
        <button type="button" onClick={onEdit} className="fb-message-actions__button">
          Edit
        </button>
      )}
    </div>
  );
}
