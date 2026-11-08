'use client';

import './styles.css';

import {
  Button,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Tooltip,
} from '@frogbotai/ui';
import { Button as AdminButton, useConfig, useListQuery, useRouteCache } from '@frogbotai/ui/admin';
import { CopyIcon } from '@frogbotai/ui/icons';
import { type ReactNode, useId, useMemo, useRef, useState } from 'react';

import { CreateKeyDataContext } from './createKeyData.js';

export type ApiKeysManagerProps = {
  collectionSlug?: string;
  /** Fields other plugins register, shown in the create dialog's Limits section. */
  createFields?: ReactNode[];
};

const quickExpiries = [
  { label: '30 days', days: 30, years: 0 },
  { label: '90 days', days: 90, years: 0 },
  { label: '1 year', days: 0, years: 1 },
];

const pad = (value: number) => String(value).padStart(2, '0');

function dayFromToday(days: number, years: number): string {
  const now = new Date();
  const day = new Date(now.getFullYear() + years, now.getMonth(), now.getDate() + days);

  if (years && day.getMonth() !== now.getMonth()) day.setDate(0);

  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

function expiryFromDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);

  return new Date(year, month - 1, date + 1).toISOString();
}

export function ApiKeysManager(props: ApiKeysManagerProps) {
  const { config } = useConfig();
  const listQuery = useListQuery();
  const collectionSlug = props.collectionSlug ?? listQuery.collectionSlug;
  const { clearRouteCache } = useRouteCache();
  const nameId = useId();
  const expiresId = useId();
  const expiresHintId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [expiresDay, setExpiresDay] = useState('');
  const [data, setData] = useState<Record<string, unknown>>({});
  const [token, setToken] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hoveredControl, setHoveredControl] = useState<'icon' | 'token'>();

  function changeOpen(next: boolean) {
    if (next) {
      setName('');
      setExpiresDay('');
      setData({});
      setToken(undefined);
      setError(undefined);
      setCopied(false);
      setHoveredControl(undefined);
    } else if (token) {
      clearRouteCache();
    }

    setOpen(next);
  }

  async function createKey() {
    if (loading || !name.trim()) return;

    setLoading(true);
    setError(undefined);

    const response = await fetch(`${config.routes.api}/${collectionSlug}/mint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        ...(Object.keys(data).length > 0 && { data }),
        ...(expiresDay && { expiresAt: expiryFromDay(expiresDay) }),
      }),
    });

    const result = (await response.json()) as { error?: string; token?: string };

    setLoading(false);
    if (!response.ok || !result.token) {
      setError(result.error ?? 'Unable to create API key');

      return;
    }

    setToken(result.token);
  }

  async function copyToken() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
  }

  const createKeyData = useMemo(
    () => ({
      data,
      setValue: (field: string, value: unknown) =>
        setData((current) => ({ ...current, [field]: value })),
    }),
    [data],
  );

  function copyHandlers(control: 'icon' | 'token') {
    return {
      onClick: copyToken,
      onMouseEnter: () => {
        setHoveredControl(control);
        setCopied(false);
      },
      onMouseLeave: () => {
        setHoveredControl(undefined);
        setCopied(false);
      },
    };
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <AdminButton
        aria-expanded={open}
        aria-haspopup="dialog"
        buttonStyle="primary"
        onClick={() => changeOpen(true)}
        ref={triggerRef}
        size="medium"
        type="button"
      >
        Create API key
      </AdminButton>
      <DialogContent
        className="api-keys-dialog"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
        withCloseButton={false}
      >
        <DialogTitle>Create API Key</DialogTitle>
        {token ? (
          <>
            <DialogDescription className="api-keys-dialog__warning" role="alert">
              Key generated! Copy it now — you won&apos;t see it again.
            </DialogDescription>
            <div className="api-keys-dialog__token-row">
              <Tooltip
                label={copied ? 'Copied' : 'Click to copy'}
                open={hoveredControl === 'token'}
              >
                <button
                  aria-label="Click to copy API key"
                  className="api-keys-dialog__token"
                  type="button"
                  {...copyHandlers('token')}
                >
                  <code>{token}</code>
                </button>
              </Tooltip>
              <Tooltip label={copied ? 'Copied' : 'Copy'} open={hoveredControl === 'icon'}>
                <Button
                  aria-label="Copy API key"
                  size="icon"
                  type="button"
                  variant="ghost"
                  {...copyHandlers('icon')}
                >
                  <CopyIcon />
                </Button>
              </Tooltip>
            </div>
          </>
        ) : (
          <>
            <DialogDescription>
              Name the key after the script or tool that uses it.
            </DialogDescription>
            <div className="api-keys-dialog__field">
              <Label htmlFor={nameId}>Key name</Label>
              <Input
                id={nameId}
                placeholder="Key name (e.g. My MacBook CLI)"
                readOnly={loading}
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void createKey();
                  }
                }}
              />
            </div>
            <div className="api-keys-dialog__field">
              <Label htmlFor={expiresId}>Expires</Label>
              <div className="api-keys-dialog__expiry">
                <Input
                  aria-describedby={expiresHintId}
                  className="api-keys-dialog__expiry-day"
                  id={expiresId}
                  max="9999-12-30"
                  min={dayFromToday(0, 0)}
                  readOnly={loading}
                  type="date"
                  value={expiresDay}
                  onChange={(event) => setExpiresDay(event.target.value)}
                />
                <div className="api-keys-dialog__expiry-quick">
                  {quickExpiries.map(({ label, days, years }) => (
                    <Button
                      disabled={loading}
                      key={label}
                      onClick={() => setExpiresDay(dayFromToday(days, years))}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      {label}
                    </Button>
                  ))}
                  <Button
                    disabled={loading}
                    onClick={() => setExpiresDay('')}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    No expiry
                  </Button>
                </div>
              </div>
              <p className="api-keys-dialog__hint" id={expiresHintId}>
                The key works through this day. Leave it empty and the key never expires.
              </p>
            </div>
            {props.createFields?.length ? (
              <Collapsible className="api-keys-dialog__limits">
                <CollapsibleTrigger className="api-keys-dialog__limits-trigger">
                  Limits
                </CollapsibleTrigger>
                <CollapsibleContent className="api-keys-dialog__limits-content">
                  <CreateKeyDataContext value={createKeyData}>
                    {props.createFields}
                  </CreateKeyDataContext>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </>
        )}
        {error ? (
          <p className="api-keys-dialog__error" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => changeOpen(false)} type="button">
            {token ? 'Close' : 'Dismiss'}
          </Button>
          {token ? null : (
            <Button disabled={loading || !name.trim()} onClick={createKey} type="button">
              {loading ? 'Generating…' : 'Generate'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function madeLabel(count: number | null | undefined) {
  if (typeof count !== 'number') return 'Also revoke the keys it made';

  return count === 1 ? 'Also revoke the key it made' : `Also revoke the ${count} keys it made`;
}

export function RevokeApiKey({
  rowData,
}: {
  rowData: { id: string | number; name?: string; revokedAt?: string | null };
}) {
  const { config } = useConfig();
  const { collectionSlug } = useListQuery();
  const { clearRouteCache } = useRouteCache();
  const cascadeId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [error, setError] = useState<string>();
  const [made, setMade] = useState<number | null>();
  const [cascade, setCascade] = useState(true);

  async function countMade() {
    try {
      const response = await fetch(
        `${config.routes.api}/${collectionSlug}/${rowData.id}/minted-count`,
      );

      const result = (await response.json()) as { count?: unknown };

      setMade(response.ok && typeof result.count === 'number' ? result.count : null);
    } catch {
      setMade(null);
    }
  }

  function changeOpen(next: boolean) {
    if (next) {
      setError(undefined);
      setMade(undefined);
      setCascade(true);
      void countMade();
    }

    setOpen(next);
  }

  const counting = made === undefined;
  const asksCascade = !counting && made !== 0;

  async function revoke() {
    if (counting) return;

    setLoading(true);
    setError(undefined);
    const response = await fetch(`${config.routes.api}/${collectionSlug}/${rowData.id}/revoke`, {
      method: 'POST',
      ...(asksCascade && {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cascade }),
      }),
    });

    setLoading(false);
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      setError(result.error ?? 'Unable to revoke API key');

      return;
    }

    setOpen(false);
    setRevoked(true);
    clearRouteCache();
  }

  if (revoked || rowData.revokedAt) return <span>Revoked</span>;

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="secondary">
          Revoke
        </Button>
      </DialogTrigger>
      <DialogContent className="api-keys-dialog" withCloseButton={false}>
        <DialogTitle>Revoke API Key</DialogTitle>
        <DialogDescription>
          This will immediately disable {rowData.name ?? 'this key'}. Any scripts or tools using
          this key will stop working. This cannot be undone.
        </DialogDescription>
        {asksCascade ? (
          <div className="api-keys-dialog__cascade">
            <Checkbox
              checked={cascade}
              disabled={loading}
              id={cascadeId}
              onCheckedChange={(checked) => setCascade(checked === true)}
            />
            <Label htmlFor={cascadeId}>{madeLabel(made)}</Label>
          </div>
        ) : null}
        {error ? (
          <p className="api-keys-dialog__error" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => changeOpen(false)} type="button">
            Cancel
          </Button>
          <Button disabled={loading || counting} onClick={revoke} type="button">
            {loading ? 'Revoking…' : 'Revoke key'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
