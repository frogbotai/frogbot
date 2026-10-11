'use client';

import type { ReactElement, ReactNode } from 'react';
import { useState } from 'react';

import { ConfirmationDialog } from '../components/confirmation-dialog.js';
import type { ChatDocument, ChatPlatformAdapter } from './adapter.js';
import { ChatRowActions } from './chat-row-actions.js';
import { RenameChatDialog } from './rename-chat-dialog.js';
import { emitChatMutation } from './use-chats.js';

export type ChatHistoryActionsProps = {
  children: ReactElement<{ children?: ReactNode }>;
  chat: ChatDocument;
  adapter: ChatPlatformAdapter;
  onDeleted?: (chat: ChatDocument) => void;
};

export function ChatHistoryActions({
  adapter,
  chat,
  children,
  onDeleted,
}: ChatHistoryActionsProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (!adapter.deleteChat) return;

    setDeleting(true);

    try {
      await adapter.deleteChat(chat.id);
      emitChatMutation();
      onDeleted?.(chat);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <ChatRowActions
        onDelete={adapter.deleteChat ? () => setDeleteOpen(true) : undefined}
        onRename={adapter.renameChat ? () => setRenameOpen(true) : undefined}
      >
        {children}
      </ChatRowActions>
      {adapter.renameChat && (
        <RenameChatDialog
          adapter={adapter}
          chatId={chat.id}
          onOpenChange={setRenameOpen}
          open={renameOpen}
          title={chat.title || 'Untitled'}
        />
      )}
      {adapter.deleteChat && (
        <ConfirmationDialog
          description="This permanently deletes the chat and its messages."
          loadingText="Deleting chat..."
          onConfirm={() => void remove()}
          onOpenChange={setDeleteOpen}
          open={deleteOpen}
          primaryButtonText="Delete"
          secondaryButtonText="Cancel"
          showLoadingOverlay={deleting}
          title="Delete chat?"
        />
      )}
    </>
  );
}
