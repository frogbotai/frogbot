'use client';

import { type FrogBotSDK, FrogBotSDKError } from '@frogbotai/sdk';
import { type ChangeEvent, useRef, useState } from 'react';

import PlusSignIcon from '../icons/icons/PlusSignIcon.js';
import { AttachmentCard, type AttachmentCardState } from './attachment-card.js';
import {
  type AttachmentKind,
  attachmentKind,
  type AttachmentMediaKind,
  extensionLabel,
  isMediaKind,
  isUploadBlocked,
  officeKind,
  typeLabel,
} from './attachment-kind.js';

export type FileReference = {
  id: string | number;
  filename: string;
  mediaType: string;
  origin?: 'paste';
};

export type PasteAttachment = {
  filename: string;
  text: string;
  type: 'paste';
};

export type ComposerAttachment = FileReference | PasteAttachment;

export type ComposerModelInput = AttachmentMediaKind | 'text';

type AttachmentItem = {
  key: number;
  name: string;
  size?: number;
  kind: AttachmentKind;
  state: AttachmentCardState;
  origin?: 'paste';
  reason?: string;
  preview?: string;
  text?: string;
  source?: File;
  attachment?: ComposerAttachment;
};

type AttachmentDraft = Omit<AttachmentItem, 'key'>;

const PASTE_NAME = 'Pasted text';

const MEDIA_WORDS: Record<AttachmentMediaKind, string> = {
  image: 'images',
  audio: 'audio',
  video: 'video',
  pdf: 'PDFs',
};

const UNSUPPORTED = "this file type isn't supported";

const UNREADABLE = "This file couldn't be read.";

function attachedMessage({ name, kind, origin }: AttachmentDraft): string {
  if (origin === 'paste') return `${name} attached`;

  return kind === 'text' ? `${name} attached as text` : `${name} attached`;
}

function uploadErrorReason(error: unknown): string | undefined {
  return error instanceof FrogBotSDKError && error.message ? error.message : undefined;
}

function isFileRefusal(error: unknown): boolean {
  if (!(error instanceof FrogBotSDKError) || error.status !== 400) return false;

  const [detail] = error.errors;
  const data = detail?.data as { errors?: { path?: unknown }[] } | undefined;

  return Boolean(data?.errors?.some((entry) => entry.path === 'file'));
}

function cardLabel({ name, kind, origin, source }: AttachmentItem): string | undefined {
  if (kind !== 'text') return extensionLabel(name);

  return typeLabel({ filename: name, mediaType: source?.type, origin });
}

export function useAttachments({
  assetsSlug,
  modelInputs,
  modelName,
  sdk,
}: {
  assetsSlug?: string;
  modelInputs?: readonly ComposerModelInput[];
  modelName?: string;
  sdk?: FrogBotSDK;
}) {
  const nextKey = useRef(0);
  const removed = useRef(new Set<number>());
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const [classifying, setClassifying] = useState(0);
  const [status, setStatus] = useState('');
  const storage = Boolean(sdk && assetsSlug);

  const update = (key: number, changes: Partial<AttachmentItem>) =>
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    );

  const refusalMessage = ({
    name,
    kind,
    reason,
  }: Pick<AttachmentDraft, 'name' | 'kind' | 'reason'>) => {
    if (reason === UNREADABLE) return `${name} won't be sent: this file couldn't be read`;

    if (!reason || !isMediaKind(kind)) return `${name} won't be sent: ${UNSUPPORTED}`;

    return `${name} won't be sent: ${modelName ?? 'this model'} can't read ${MEDIA_WORDS[kind]}`;
  };

  const upload = async (item: AttachmentItem) => {
    if (!sdk || !assetsSlug || !item.source) return;

    update(item.key, { state: 'uploading', reason: undefined });

    try {
      const uploaded = await sdk.upload(assetsSlug, item.source);

      if (removed.current.has(item.key)) return;

      const reference: FileReference = {
        id: uploaded.id,
        filename: item.name,
        mediaType: uploaded.mimeType,
        ...(item.origin ? { origin: item.origin } : {}),
      };

      update(item.key, {
        state: item.kind === 'text' ? 'text' : 'ready',
        text: typeof uploaded.text === 'string' ? uploaded.text : item.text,
        attachment: reference,
      });

      setStatus(attachedMessage(item));
    } catch (error) {
      if (removed.current.has(item.key)) return;

      if (isFileRefusal(error)) {
        update(item.key, { state: 'refused', reason: UNREADABLE });
        setStatus(refusalMessage({ ...item, reason: UNREADABLE }));

        return;
      }

      if (error instanceof FrogBotSDKError && error.status === 413) {
        update(item.key, { state: 'too-large' });
        setStatus(`Too large to upload: ${item.name}`);

        return;
      }

      update(item.key, { state: 'failed', reason: uploadErrorReason(error) });
      setStatus(`Upload failed: ${item.name}`);
    }
  };

  const describe = async (file: File): Promise<AttachmentDraft> => {
    if (officeKind({ mediaType: file.type, filename: file.name })) {
      return { name: file.name, kind: 'text', state: 'uploading', source: file };
    }

    const kind = await attachmentKind(file);
    const draft = { name: file.name, size: file.size, kind };
    const blocked = isUploadBlocked(file);

    if (kind === 'binary' || (blocked && kind !== 'text')) {
      return { ...draft, state: 'refused' };
    }

    if (isMediaKind(kind) && modelInputs && !modelInputs.includes(kind)) {
      return {
        ...draft,
        state: 'refused',
        reason: `${modelName ?? 'This model'} can't read ${MEDIA_WORDS[kind]}.`,
      };
    }

    if (kind !== 'text') {
      return {
        ...draft,
        state: 'uploading',
        source: file,
        preview: kind === 'image' ? URL.createObjectURL(file) : undefined,
      };
    }

    const text = await file.text();
    const source = blocked ? new File([text], `${file.name}.txt`, { type: 'text/plain' }) : file;

    return { ...draft, state: 'uploading', text, source };
  };

  const classify = (file: File) =>
    describe(file).catch((): AttachmentDraft => ({
      name: file.name,
      size: file.size,
      kind: 'binary',
      state: 'failed',
      reason: UNREADABLE,
    }));

  const announcement = (draft: AttachmentDraft) => {
    if (draft.state === 'failed') return `Upload failed: ${draft.name}`;

    return draft.state === 'refused' ? refusalMessage(draft) : undefined;
  };

  const insert = (drafts: AttachmentDraft[]) => {
    const added = drafts.map((draft) => ({ ...draft, key: nextKey.current++ }));

    setItems((current) => [...current, ...added]);

    const messages = added.flatMap((item) => announcement(item) ?? []);

    if (messages.length) setStatus(messages.join('. '));

    for (const item of added) {
      if (item.state === 'uploading') void upload(item);
    }
  };

  const add = async (files: File[]) => {
    if (!storage || !files.length) return;

    setClassifying((count) => count + 1);

    const drafts = await Promise.all(files.map(classify));

    setClassifying((count) => count - 1);
    insert(drafts);
  };

  const addPaste = (text: string) => {
    const filename = `pasted-${Date.now()}.txt`;
    const source = new File([text], filename, { type: 'text/plain' });

    const draft: AttachmentDraft = {
      name: PASTE_NAME,
      size: source.size,
      kind: 'text',
      origin: 'paste',
      text,
      state: storage ? 'uploading' : 'text',
      source,
      attachment: storage ? undefined : { type: 'paste', text, filename },
    };

    insert([draft]);

    if (!storage) setStatus(attachedMessage(draft));
  };

  const discard = (keys: number[]) => {
    const gone = new Set(keys);

    for (const key of keys) removed.current.add(key);

    for (const item of items) {
      if (gone.has(item.key) && item.preview) URL.revokeObjectURL(item.preview);
    }

    setItems((current) => current.filter((item) => !gone.has(item.key)));
  };

  const remove = (key: number) => {
    const item = items.find((entry) => entry.key === key);

    discard([key]);

    if (item) setStatus(`${item.name} removed`);
  };

  const retry = (key: number) => {
    const item = items.find((entry) => entry.key === key);

    if (item?.state === 'failed') void upload(item);
  };

  return {
    add,
    addPaste,
    clear: discard,
    items,
    remove,
    retry,
    status,
    storage,
    toSend: items.flatMap((item) => (item.attachment ? [item.attachment] : [])),
    uploading: classifying > 0 || items.some((item) => item.state === 'uploading'),
  };
}

export function AttachmentControl({
  accept,
  add,
  disabled,
}: {
  accept?: string;
  add: (files: File[]) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);

  const select = (event: ChangeEvent<HTMLInputElement>) => {
    add(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={accept}
        tabIndex={-1}
        className="fb-attachments__input"
        onChange={select}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label="Add files"
        onClick={() => input.current?.click()}
        className="fb-attachments__add"
      >
        <PlusSignIcon className="fb-attachments__add-icon" />
      </button>
    </>
  );
}

export function AttachmentList({
  items,
  remove,
  retry,
  status,
}: {
  items: AttachmentItem[];
  remove: (key: number) => void;
  retry: (key: number) => void;
  status: string;
}) {
  return (
    <>
      <div role="status" className="fb-attachments__status">
        {status}
      </div>
      {items.length > 0 && (
        <div className="fb-attachments__previews">
          <div role="list" aria-label="Attachments" className="fb-attachments__scroll">
            {items.map((item) => (
              <div key={item.key} role="listitem" className="fb-attachments__card">
                <AttachmentCard
                  name={item.name}
                  state={item.state}
                  typeLabel={item.preview ? undefined : cardLabel(item)}
                  preview={item.preview ? <img src={item.preview} alt={item.name} /> : undefined}
                  text={item.text}
                  size={item.size}
                  reason={item.reason}
                  onRemove={() => remove(item.key)}
                  onRetry={
                    item.state === 'failed' && item.source ? () => retry(item.key) : undefined
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
