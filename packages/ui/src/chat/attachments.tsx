'use client';

import type { FrogBotSDK } from '@frogbotai/sdk';
import { type ChangeEvent, useRef, useState } from 'react';

import CloseIcon from '../icons/icons/CloseIcon.js';
import FileIcon from '../icons/icons/FileIcon.js';
import LoadingIcon from '../icons/icons/LoadingIcon.js';
import PlusSignIcon from '../icons/icons/PlusSignIcon.js';
import RefreshIcon from '../icons/icons/RefreshIcon.js';

export type FileReference = {
  id: string | number;
  filename: string;
  mediaType: string;
};

export type PasteAttachment = {
  filename: string;
  text: string;
  type: 'paste';
};

export type ComposerAttachment = FileReference | PasteAttachment;

type UploadItem = {
  key: number;
  file: File;
  preview?: string;
  reference?: FileReference;
  error?: string;
  uploading: boolean;
};

export function useAttachments({ filesSlug, sdk }: { filesSlug?: string; sdk?: FrogBotSDK }) {
  const nextKey = useRef(0);
  const [items, setItems] = useState<UploadItem[]>([]);

  const upload = async (item: UploadItem) => {
    if (!sdk || !filesSlug) return;
    setItems((current) =>
      current.map((entry) =>
        entry.key === item.key ? { ...entry, error: undefined, uploading: true } : entry,
      ),
    );
    try {
      const uploaded = await sdk.upload(filesSlug, item.file);
      setItems((current) =>
        current.map((entry) =>
          entry.key === item.key
            ? {
                ...entry,
                reference: {
                  id: uploaded.id,
                  filename: uploaded.filename,
                  mediaType: uploaded.mimeType,
                },
                uploading: false,
              }
            : entry,
        ),
      );
    } catch (error) {
      setItems((current) =>
        current.map((entry) =>
          entry.key === item.key
            ? {
                ...entry,
                error: error instanceof Error ? error.message : 'Upload failed',
                uploading: false,
              }
            : entry,
        ),
      );
    }
  };

  const add = (files: File[]) => {
    const added = files.map((file) => ({
      key: nextKey.current++,
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      uploading: true,
    }));
    setItems((current) => [...current, ...added]);
    for (const item of added) void upload(item);
  };

  const remove = (key: number) =>
    setItems((current) => {
      const item = current.find((entry) => entry.key === key);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return current.filter((entry) => entry.key !== key);
    });
  const clear = () =>
    setItems((current) => {
      for (const item of current) if (item.preview) URL.revokeObjectURL(item.preview);
      return [];
    });

  return {
    add,
    clear,
    items,
    references: items.flatMap((item) => (item.reference ? [item.reference] : [])),
    remove,
    retry: (key: number) => {
      const item = items.find((entry) => entry.key === key);
      if (item) void upload(item);
    },
    uploading: items.some((item) => item.uploading),
  };
}

export function AttachmentControl({
  add,
  disabled,
}: {
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

export function AttachmentPreviews({
  items,
  remove,
  retry,
}: {
  items: UploadItem[];
  remove: (key: number) => void;
  retry: (key: number) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="fb-attachments__previews">
      <div className="fb-attachments__scroll">
        {items.map((item) => (
          <div key={item.key} className="fb-attachments__item">
            <div className="fb-attachments__preview">
              {item.preview ? (
                <img src={item.preview} alt={item.file.name} className="fb-attachments__image" />
              ) : (
                <>
                  <FileIcon className="fb-attachments__file-icon" />
                  <p className="fb-attachments__filename">{item.file.name}</p>
                </>
              )}
              {item.uploading && (
                <LoadingIcon
                  aria-label={`Uploading ${item.file.name}`}
                  className="fb-attachments__loader"
                />
              )}
              {item.error && (
                <button
                  type="button"
                  aria-label={`Retry ${item.file.name}`}
                  title={item.error}
                  onClick={() => retry(item.key)}
                  className="fb-attachments__retry"
                >
                  <RefreshIcon className="fb-attachments__retry-icon" />
                </button>
              )}
              <button
                type="button"
                aria-label={`Remove ${item.file.name}`}
                onClick={() => remove(item.key)}
                className="fb-attachments__remove"
              >
                <CloseIcon className="fb-attachments__remove-icon" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PastePreviews({
  items,
  remove,
}: {
  items: PasteAttachment[];
  remove: (index: number) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="fb-attachments__previews">
      <div className="fb-attachments__scroll">
        {items.map((item, index) => (
          <div key={item.filename} data-testid="paste-attachment" className="fb-attachments__paste">
            <div className="fb-attachments__paste-text">{item.text}</div>
            <button
              type="button"
              aria-label={`Remove ${item.filename}`}
              onClick={() => remove(index)}
              className="fb-attachments__remove fb-attachments__remove--paste"
            >
              <CloseIcon className="fb-attachments__remove-icon" />
            </button>
            <div className="fb-attachments__paste-label">PASTED</div>
          </div>
        ))}
      </div>
    </div>
  );
}
