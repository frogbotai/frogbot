'use client';

import './BulkDialog.css';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  RadioGroup,
  RadioGroupItem,
} from '@frogbotai/ui';
import { getTranslation } from '@payloadcms/translations';
import { toast, useConfig, useLocale, useTranslation } from '@payloadcms/ui';
import { type FormEvent, type ReactNode, useId, useState } from 'react';

import {
  type AIBulkChoice,
  type AIBulkField,
  aiBulkLoadURL,
  aiBulkRequests,
  aiBulkResultMessage,
  type AIBulkScope,
  aiBulkTargets,
} from './bulk.js';

type AIBulkResponse = {
  docs?: unknown;
  errors?: { message?: string }[];
  message?: string;
};

type AIBulkRun = { error?: { message?: string }; loaded: number; queued: number };

type AIBulkChoiceOption = { hint?: string; label: string; value: AIBulkChoice };

const defaultChoice: AIBulkChoice = 'never';

async function send(url: string, init?: RequestInit): Promise<AIBulkResponse | undefined> {
  const response = await fetch(url, { credentials: 'include', ...init }).catch(() => undefined);

  if (!response) return undefined;

  return (await response.json().catch(() => ({}))) as AIBulkResponse;
}

function serverError(result: AIBulkResponse | undefined): { message?: string } {
  return { message: result?.errors?.[0]?.message ?? result?.message };
}

async function runBulk({
  api,
  choice,
  collectionSlug,
  drafts,
  field,
  locale,
  scope,
}: {
  api: string;
  choice: AIBulkChoice;
  collectionSlug: string;
  drafts: boolean;
  field: AIBulkField;
  locale?: string;
  scope: AIBulkScope;
}): Promise<AIBulkRun> {
  const load = await send(
    aiBulkLoadURL({ api, choice, collectionSlug, drafts, field, locale, where: scope.where }),
  );

  if (!Array.isArray(load?.docs)) return { error: serverError(load), loaded: 0, queued: 0 };

  const docs = load.docs as Record<string, unknown>[];
  const targets = aiBulkTargets({ docs, drafts, field });
  const requests = aiBulkRequests({ api, choice, collectionSlug, drafts, field, locale, targets });

  let queued = 0;

  for (const { body, url } of requests) {
    const result = await send(url, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    });

    if (!Array.isArray(result?.docs) || !Array.isArray(result.errors)) {
      return { error: serverError(result), loaded: docs.length, queued };
    }

    queued += result.docs.length;
  }

  return { loaded: docs.length, queued };
}

export function AIBulkDialog({
  collectionSlug,
  field,
  onDone,
  onOpenChange,
  open,
  scope,
}: {
  collectionSlug: string;
  field: AIBulkField;
  onDone: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  scope: AIBulkScope;
}): ReactNode {
  const id = useId();
  const { config, getEntityConfig } = useConfig();
  const locale = useLocale()?.code || undefined;
  const { i18n } = useTranslation();
  const [choice, setChoice] = useState<AIBulkChoice>(defaultChoice);
  const [sending, setSending] = useState(false);

  const drafts = Boolean(getEntityConfig({ collectionSlug })?.versions?.drafts);

  const choices: AIBulkChoiceOption[] = [
    {
      hint: 'Also replaces values edited by hand.',
      label: scope.hasSelection ? 'All selected' : 'All in view',
      value: 'all',
    },
    { label: 'Only values written by AI', value: 'generated' },
    { label: 'Only failed', value: 'failed' },
    { label: 'Only never generated', value: 'never' },
  ];

  const close = () => {
    setChoice(defaultChoice);
    onOpenChange(false);
  };

  const changeOpen = (next: boolean) => {
    if (sending) return;

    if (next) onOpenChange(true);
    else close();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (sending) return;

    setSending(true);

    const run = await runBulk({
      api: config.routes.api,
      choice,
      collectionSlug,
      drafts,
      field,
      locale,
      scope,
    });

    const { message, type } = aiBulkResultMessage(run);

    setSending(false);
    close();
    toast[type](message);
    onDone();
  };

  const preventWhileSending = (event: Event) => {
    if (sending) event.preventDefault();
  };

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogContent
        aria-describedby={undefined}
        onEscapeKeyDown={preventWhileSending}
        onInteractOutside={preventWhileSending}
        withCloseButton={!sending}
      >
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>Regenerate {getTranslation(field.label || field.name, i18n)}</DialogTitle>
          </DialogHeader>
          <RadioGroup
            aria-label="Records to regenerate"
            className="ai-bulk-dialog__choices"
            disabled={sending}
            onValueChange={(value) => setChoice(value as AIBulkChoice)}
            value={choice}
          >
            {choices.map(({ hint, label, value }) => (
              <Label className="ai-bulk-dialog__choice" htmlFor={`${id}-${value}`} key={value}>
                <RadioGroupItem
                  aria-describedby={hint ? `${id}-${value}-hint` : undefined}
                  aria-labelledby={`${id}-${value}-label`}
                  id={`${id}-${value}`}
                  value={value}
                />
                <span className="ai-bulk-dialog__choice-text">
                  <span id={`${id}-${value}-label`}>{label}</span>
                  {hint && (
                    <span className="ai-bulk-dialog__hint" id={`${id}-${value}-hint`}>
                      {hint}
                    </span>
                  )}
                </span>
              </Label>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button disabled={sending} onClick={close} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={sending} type="submit">
              {sending ? 'Queueing…' : 'Regenerate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
