'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  const sortable = useSortable({ disabled, id });
  return (
    <div
      {...sortable.attributes}
      {...sortable.listeners}
      className="frog-board__card"
      onClick={onClick}
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
    >
      {children}
    </div>
  );
}
