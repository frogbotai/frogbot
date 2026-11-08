'use client';

import { useDraggable } from '@dnd-kit/core';
import type { KeyboardEvent, ReactNode } from 'react';

export function BoardCard({
  children,
  className,
  disabled,
  id,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  id: string;
  onClick?: () => void;
}) {
  const draggable = useDraggable({ disabled, id });
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.preventDefault();
    onClick?.();
  };

  return (
    <div
      {...draggable.attributes}
      {...draggable.listeners}
      className={`frog-board__card${draggable.isDragging ? ' frog-board__card--dragging' : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      onKeyDown={onClick ? onKeyDown : undefined}
      ref={draggable.setNodeRef}
    >
      {children}
    </div>
  );
}
