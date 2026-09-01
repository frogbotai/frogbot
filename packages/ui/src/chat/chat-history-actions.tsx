'use client';

import type { FrogBotSDK } from '@frogbotai/sdk';
import type { ReactElement, ReactNode } from 'react';
import { useState } from 'react';

import { ConfirmationDialog } from '../components/confirmation-dialog.js';
import { ChatRowActions } from './chat-row-actions.js';
import { deleteChat } from './mutations.js';
import { RenameChatDialog } from './rename-chat-dialog.js';
import type { ChatDocument } from './use-chats.js';

export type ChatHistoryActionsProps = {
  children: ReactElement<{ children?: ReactNode }>;
  chat: ChatDocument;
  sdk: FrogBotSDK;
  chatsSlug: string;
  messagesSlug: string;
  onDeleted?: (chat: ChatDocument) => void;
};

export function ChatHistoryActions({
  chat,
  chatsSlug,
  children,
  messagesSlug,
  onDeleted,
  sdk,
}: ChatHistoryActionsProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteChat({ sdk, chatsSlug, messagesSlug, chatId: chat.id });
      onDeleted?.(chat);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <ChatRowActions onDelete={() => setDeleteOpen(true)} onRename={() => setRenameOpen(true)}>
        {children}
      </ChatRowActions>
      <RenameChatDialog
        chatId={chat.id}
        chatsSlug={chatsSlug}
        onOpenChange={setRenameOpen}
        open={renameOpen}
        sdk={sdk}
        title={chat.title || 'Untitled'}
      />
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
    </>
  );
}
