'use client';

import { useDraggable } from '@dnd-kit/core';
import type { ReactNode } from 'react';

export function BoardCard({
  children,
  disabled,
  id,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  id: string;
  onClick?: () => void;
}) {
  const draggable = useDraggable({ disabled, id });
  return (
    <div
      {...draggable.attributes}
      {...draggable.listeners}
      className={`frog-board__card${draggable.isDragging ? ' frog-board__card--dragging' : ''}`}
      onClick={onClick}
      ref={draggable.setNodeRef}
    >
      {children}
    </div>
  );
}
