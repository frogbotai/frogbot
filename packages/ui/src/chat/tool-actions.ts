'use client';

import { createContext, use } from 'react';

export type ToolActions = {
  addToolOutput: (options: { tool: string; toolCallId: string; output: unknown }) => Promise<void>;
  dismissToolCall?: (toolCallId: string) => Promise<void>;
  answerApproval?: (
    toolCallId: string,
    answer: { approved: boolean; reason?: string },
  ) => Promise<void>;
  /** Deny can end the turn without a reason; otherwise a denial needs one. */
  denyWithoutReason?: boolean;
  pendingToolCallIds: ReadonlySet<string>;
  dockedToolCallIds?: ReadonlySet<string>;
  isReadonly?: boolean;
  channelLabel?: string;
};

export const ToolActionsContext = createContext<ToolActions | undefined>(undefined);

export function useToolActions(): ToolActions | undefined {
  return use(ToolActionsContext);
}
