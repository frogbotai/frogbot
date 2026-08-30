'use client';
import { useEffect, useRef, useState } from 'react';
export type EditableTextProps = {
  className?: string;
  disallowEditingOnClick?: boolean;
  isEditing: boolean;
  onValueChange: (value: string) => void;
  readonly?: boolean;
  setIsEditing: (editing: boolean) => void;
  tooltipContent?: string;
  value?: string;
};
export function EditableText({
  className,
  disallowEditingOnClick,
  isEditing,
  onValueChange,
  readonly = false,
  setIsEditing,
  tooltipContent,
  value: externalValue,
}: EditableTextProps) {
  const [value, setValue] = useState(externalValue);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setValue(externalValue), [externalValue]);
  useEffect(() => {
    if (isEditing) {
      ref.current?.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      if (ref.current && selection) {
        range.selectNodeContents(ref.current);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }, [isEditing]);
  const commit = () => {
    const next = ref.current?.textContent?.trim() || value || '';
    setValue(next);
    if (next && next !== externalValue) onValueChange(next);
    setIsEditing(false);
  };
  return (
    <div
      ref={ref}
      className={`fb-editable-text${isEditing ? ' fb-editable-text--editing' : ''}${className ? ` ${className}` : ''}`}
      contentEditable={isEditing}
      suppressContentEditableWarning
      tabIndex={isEditing ? 0 : undefined}
      title={tooltipContent ?? value}
      onClick={() => {
        if (!readonly && !disallowEditingOnClick) setIsEditing(true);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          setValue(externalValue);
          setIsEditing(false);
        }
      }}
    >
      {value}
    </div>
  );
}
