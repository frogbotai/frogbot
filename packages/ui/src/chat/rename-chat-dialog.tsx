'use client';

import type { FrogBotSDK } from '@frogbotai/sdk';
import { useEffect, useRef, useState } from 'react';

import { Button } from '../components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog';
import { Input } from '../components/input';
import MagicWandIcon from '../icons/icons/MagicWandIcon';
import { renameChat, suggestChatTitle } from './mutations';

export type RenameChatDialogProps = {
  sdk: FrogBotSDK;
  chatsSlug: string;
  chatId: string | number;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRenamed?: (title: string) => void;
};

export function RenameChatDialog({
  chatId,
  chatsSlug,
  onOpenChange,
  onRenamed,
  open,
  sdk,
  title,
}: RenameChatDialogProps) {
  const [value, setValue] = useState(title);
  const [suggestion, setSuggestion] = useState<string>();
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let current = true;
    setValue(title);
    setSuggestion(undefined);
    void suggestChatTitle({ sdk, chatId })
      .then((next) => {
        if (current) setSuggestion(next);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [chatId, open, sdk, title]);

  const save = async () => {
    const next = value.trim();
    if (!next) return;
    setSaving(true);
    try {
      await renameChat({ sdk, chatsSlug, chatId }, next);
      onRenamed?.(next);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="fb-rename-chat-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          input.current?.focus();
          input.current?.select();
        }}
      >
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
          <DialogDescription>Choose a clear name for this conversation.</DialogDescription>
        </DialogHeader>
        <Input
          ref={input}
          aria-label="Chat title"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save();
          }}
        />
        {suggestion && (
          <button
            className="fb-rename-chat-dialog__suggestion"
            onClick={() => setValue(suggestion)}
            type="button"
          >
            <MagicWandIcon />
            <span>{suggestion}</span>
          </button>
        )}
        <DialogFooter>
          <Button disabled={saving} onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button disabled={saving || !value.trim()} onClick={() => void save()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
