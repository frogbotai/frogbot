'use client';

import './styles.css';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@frogbotai/ui';
import { PopupList, useConfig, useDocumentInfo } from '@frogbotai/ui/admin';
import { formatAdminURL } from 'payload/shared';
import { useEffect, useId, useState } from 'react';

import { expiryChoices, linksListPath } from './links.js';

export type EditLinkMenuItemProps = {
  /** Seconds a link lasts unless the person picks another length. */
  defaultExpiry: number;
  /** The longest a link may last, in seconds. */
  maxExpiry: number;
};

type LinkForm = { id: number | string; title: string };

/**
 * "Create edit link" in a record's menu, when an `update` or `both` form targets the collection
 * and the user can update the record. It shows the link's URL once.
 */
export function EditLinkMenuItem({ defaultExpiry, maxExpiry }: EditLinkMenuItemProps) {
  const { config } = useConfig();
  const { collectionSlug, docPermissions, id } = useDocumentInfo();
  const api = config.routes.api;
  const canUpdate = Boolean(docPermissions?.update);
  const formId = useId();
  const expiryId = useId();
  const usesId = useId();
  const urlId = useId();

  const [forms, setForms] = useState<LinkForm[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState('');
  const [expiry, setExpiry] = useState(String(defaultExpiry));
  const [uses, setUses] = useState('');
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id || !collectionSlug || !canUpdate) return;

    const query = new URLSearchParams({
      'where[collection][equals]': collectionSlug,
      'where[mode][in][0]': 'update',
      'where[mode][in][1]': 'both',
      'select[title]': 'true',
      depth: '0',
      limit: '100',
      sort: 'title',
    });

    const controller = new AbortController();

    void fetch(`${api}/forms?${query.toString()}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) =>
        response.ok ? ((await response.json()) as { docs: LinkForm[] }) : null,
      )
      .then((result) => setForms(result?.docs ?? []))
      .catch(() => undefined);

    return () => controller.abort();
  }, [api, canUpdate, collectionSlug, id]);

  if (!id || !collectionSlug || !canUpdate || forms.length === 0) return null;

  const changeOpen = (next: boolean) => {
    if (next) {
      setForm(String(forms[0]?.id ?? ''));
      setExpiry(String(defaultExpiry));
      setUses('');
      setUrl(undefined);
      setError(undefined);
      setCopied(false);
    }

    setOpen(next);
  };

  const create = async () => {
    if (loading || !form) return;

    const limit = uses.trim() ? Number(uses) : null;

    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      setError('Use a whole number above 0, or leave it empty.');

      return;
    }

    setLoading(true);
    setError(undefined);

    try {
      const response = await fetch(`${api}/form-links`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          form: forms.find((item) => String(item.id) === form)?.id ?? form,
          record: id,
          expiresIn: Number(expiry),
          maxSubmissions: limit,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as { url?: string; error?: string };

      if (!response.ok || !result.url) setError(result.error ?? 'The link could not be created.');
      else setUrl(result.url);
    } catch {
      setError('The link could not be created.');
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!url) return;

    await navigator.clipboard.writeText(url);
    setCopied(true);
  };

  const listURL = formatAdminURL({
    adminRoute: config.routes.admin,
    path: linksListPath(collectionSlug, id),
  });

  return (
    <>
      <PopupList.Button onClick={() => changeOpen(true)}>Create edit link</PopupList.Button>
      <PopupList.Button href={listURL}>View edit links</PopupList.Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="fb-form-links-dialog">
          <DialogTitle>Create edit link</DialogTitle>
          {url ? (
            <>
              <DialogDescription role="alert">
                Copy the link now. It isn&apos;t shown again; anyone who has it can edit this record
                through the form until it expires or you revoke it.
              </DialogDescription>
              <div className="fb-form-links-dialog__field">
                <Label htmlFor={urlId}>Edit link</Label>
                <Input id={urlId} readOnly value={url} onFocus={(event) => event.target.select()} />
              </div>
            </>
          ) : (
            <>
              <DialogDescription>
                The link opens this record in the form, filled in, for someone to change.
              </DialogDescription>
              <div className="fb-form-links-dialog__field">
                <Label id={formId}>Form</Label>
                <Select value={form} onValueChange={setForm}>
                  <SelectTrigger aria-labelledby={formId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {forms.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="fb-form-links-dialog__field">
                <Label id={expiryId}>Expires after</Label>
                <Select value={expiry} onValueChange={setExpiry}>
                  <SelectTrigger aria-labelledby={expiryId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {expiryChoices(defaultExpiry, maxExpiry).map((choice) => (
                      <SelectItem key={choice.seconds} value={String(choice.seconds)}>
                        {choice.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="fb-form-links-dialog__field">
                <Label htmlFor={usesId}>Saves allowed</Label>
                <Input
                  id={usesId}
                  inputMode="numeric"
                  min={1}
                  placeholder="No limit"
                  type="number"
                  value={uses}
                  onChange={(event) => setUses(event.target.value)}
                />
              </div>
            </>
          )}
          {error ? (
            <p className="fb-form-links-dialog__error" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => changeOpen(false)}>
              {url ? 'Done' : 'Cancel'}
            </Button>
            {url ? (
              <Button type="button" onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            ) : (
              <Button disabled={loading || !form} type="button" onClick={() => void create()}>
                {loading ? 'Creating…' : 'Create link'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
