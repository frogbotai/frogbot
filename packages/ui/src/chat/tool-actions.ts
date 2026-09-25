'use client';

import { createContext, use } from 'react';

export type ToolActions = {
  addToolOutput: (options: { tool: string; toolCallId: string; output: unknown }) => Promise<void>;
  dismissToolCall: (toolCallId: string) => Promise<void>;
  pendingToolCallIds: ReadonlySet<string>;
};

export const ToolActionsContext = createContext<ToolActions | undefined>(undefined);

export function useToolActions(): ToolActions | undefined {
  return use(ToolActionsContext);
}
