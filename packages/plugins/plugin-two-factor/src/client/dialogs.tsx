'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
  Label,
} from '@frogbotai/ui';
import { type ReactNode, useId, useState } from 'react';

import { RecoveryCodes } from './RecoveryCodes.js';
import { postTwoFactor } from './request.js';

type Setup = { secret: string; uri: string; qrCode: string };

type Trigger = { label: string; variant?: 'default' | 'secondary' };

function TriggerButton({ label, variant = 'default', onOpen }: Trigger & { onOpen: () => void }) {
  return (
    <Button aria-haspopup="dialog" onClick={onOpen} size="sm" type="button" variant={variant}>
      {label}
    </Button>
  );
}

type Codes = { message: string; recoveryCodes: string[] };

function CodeInput({
  label,
  value,
  disabled,
  onChange,
  onEnter,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onEnter: () => void;
}) {
  const id = useId();

  return (
    <div className="two-factor__field">
      <Label htmlFor={id}>{label}</Label>
      <Input
        autoComplete="one-time-code"
        autoFocus
        id={id}
        inputMode="text"
        readOnly={disabled}
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;

          event.preventDefault();
          onEnter();
        }}
      />
    </div>
  );
}

function ErrorText({ error }: { error?: string }) {
  return error ? (
    <p className="two-factor__error" role="alert">
      {error}
    </p>
  ) : null;
}

function SavedCodes({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  return (
    <>
      <DialogDescription className="two-factor__warning" role="alert">
        Save these recovery codes now — you won&apos;t see them again.
      </DialogDescription>
      <DialogDescription>
        Each code signs you in once if you lose your authenticator app.
      </DialogDescription>
      <RecoveryCodes codes={codes} />
      <DialogFooter>
        <Button onClick={onClose} type="button">
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

/** Turns two-factor sign-in on: scan the QR code or enter the key, confirm a code, save the recovery codes. `onEnabled` runs when the codes are closed. */
export function EnableDialog({
  base,
  trigger,
  onEnabled,
}: {
  base: string;
  trigger: Trigger;
  onEnabled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [setup, setSetup] = useState<Setup>();
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);

    const result = await postTwoFactor<Setup>(`${base}/enable/start`);

    setLoading(false);
    if (result.ok) setSetup(result.data);
    else setError(result.error);
  }

  function changeOpen(next: boolean) {
    if (next) {
      setSetup(undefined);
      setCode('');
      setCodes(undefined);
      setError(undefined);
      void start();
    } else if (codes) {
      onEnabled();
    }

    setOpen(next);
  }

  async function confirm() {
    if (loading || !code.trim()) return;

    setLoading(true);
    setError(undefined);

    const result = await postTwoFactor<Codes>(`${base}/enable`, { code });

    setLoading(false);
    if (!result.ok) {
      setError(result.error);

      return;
    }

    setCodes(result.data.recoveryCodes);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <TriggerButton {...trigger} onOpen={() => changeOpen(true)} />
      <DialogContent className="two-factor-dialog" withCloseButton={false}>
        <DialogTitle>Turn on two-factor sign-in</DialogTitle>
        {codes ? (
          <SavedCodes codes={codes} onClose={() => changeOpen(false)} />
        ) : (
          <>
            <DialogDescription>
              Scan the QR code with an authenticator app, or enter the key, then type the 6-digit
              code it shows.
            </DialogDescription>
            {setup ? (
              <div className="two-factor__setup">
                <img
                  alt="QR code for your authenticator app"
                  className="two-factor__qr"
                  height={176}
                  src={setup.qrCode}
                  width={176}
                />
                <div className="two-factor__field">
                  <span className="two-factor__label">Key</span>
                  <code className="two-factor__key">{setup.secret}</code>
                </div>
              </div>
            ) : null}
            {setup ? (
              <CodeInput
                disabled={loading}
                label="6-digit code"
                value={code}
                onChange={setCode}
                onEnter={confirm}
              />
            ) : null}
            <ErrorText error={error} />
            <DialogFooter>
              <Button onClick={() => changeOpen(false)} type="button" variant="secondary">
                Cancel
              </Button>
              <Button disabled={loading || !setup || !code.trim()} onClick={confirm} type="button">
                {loading && setup ? 'Checking…' : 'Turn on'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Asks for a code before an action; shows new recovery codes when the action returns them. */
export function CodeDialog({
  title,
  description,
  label,
  action,
  url,
  trigger,
  onDone,
}: {
  title: string;
  description: ReactNode;
  label: string;
  action: string;
  url: string;
  trigger: Trigger;
  onDone: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  function changeOpen(next: boolean) {
    if (next) {
      setCode('');
      setCodes(undefined);
      setError(undefined);
    }

    setOpen(next);
  }

  async function submit() {
    if (loading || !code.trim()) return;

    setLoading(true);
    setError(undefined);

    const result = await postTwoFactor<Partial<Codes> & { message: string }>(url, { code });

    setLoading(false);
    if (!result.ok) {
      setError(result.error);

      return;
    }

    onDone(result.data.message);
    if (result.data.recoveryCodes) setCodes(result.data.recoveryCodes);
    else changeOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <TriggerButton {...trigger} onOpen={() => changeOpen(true)} />
      <DialogContent className="two-factor-dialog" withCloseButton={false}>
        <DialogTitle>{title}</DialogTitle>
        {codes ? (
          <SavedCodes codes={codes} onClose={() => changeOpen(false)} />
        ) : (
          <>
            <DialogDescription>{description}</DialogDescription>
            <CodeInput
              disabled={loading}
              label={label}
              value={code}
              onChange={setCode}
              onEnter={submit}
            />
            <ErrorText error={error} />
            <DialogFooter>
              <Button onClick={() => changeOpen(false)} type="button" variant="secondary">
                Cancel
              </Button>
              <Button disabled={loading || !code.trim()} onClick={submit} type="button">
                {loading ? 'Checking…' : action}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Confirms an admin's reset of another user's two-factor sign-in. */
export function ResetDialog({
  base,
  userId,
  name,
  trigger,
  onReset,
}: {
  base: string;
  userId: string | number;
  name: string;
  trigger: Trigger;
  onReset: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function reset() {
    setLoading(true);
    setError(undefined);

    const result = await postTwoFactor<{ message: string }>(`${base}/reset`, { id: userId });

    setLoading(false);
    if (!result.ok) {
      setError(result.error);

      return;
    }

    setOpen(false);
    onReset(result.data.message);
  }

  function changeOpen(next: boolean) {
    if (next) setError(undefined);

    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <TriggerButton {...trigger} onOpen={() => changeOpen(true)} />
      <DialogContent className="two-factor-dialog" withCloseButton={false}>
        <DialogTitle>Reset two-factor sign-in</DialogTitle>
        <DialogDescription>
          This removes the authenticator and recovery codes of {name} and signs them out everywhere.
          If two-factor sign-in is required for them, they set it up again at their next sign-in.
        </DialogDescription>
        <ErrorText error={error} />
        <DialogFooter>
          <Button onClick={() => changeOpen(false)} type="button" variant="secondary">
            Cancel
          </Button>
          <Button disabled={loading} onClick={reset} type="button" variant="destructive">
            {loading ? 'Resetting…' : 'Reset'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
