'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

const api = () => (window as Window & { turnstile?: TurnstileApi }).turnstile;

let loading: Promise<TurnstileApi> | undefined;

function loadTurnstile(): Promise<TurnstileApi> {
  const loaded = api();
  if (loaded) return Promise.resolve(loaded);

  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');

    script.src = SCRIPT_URL;
    script.async = true;

    script.onload = () => {
      const ready = api();

      if (ready) resolve(ready);
      else reject(new Error('Turnstile did not load.'));
    };

    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new Error('Turnstile did not load.'));
    };

    document.head.append(script);
  });

  return loading;
}

/** Renders Cloudflare's Turnstile widget into `ref` while `active`, loading its script on first use. */
export function useTurnstile(siteKey: string | undefined, active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: TurnstileApi; id: string }>(undefined);
  const [token, setToken] = useState('');

  useEffect(() => {
    const element = ref.current;
    if (!siteKey || !active || !element) return;

    let cancelled = false;

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled) return;

        const id = turnstile.render(element, {
          sitekey: siteKey,
          callback: setToken,
          'expired-callback': () => setToken(''),
          'error-callback': () => setToken(''),
        });

        widget.current = { api: turnstile, id };
      })
      .catch(() => setToken(''));

    return () => {
      cancelled = true;

      if (widget.current) widget.current.api.remove(widget.current.id);

      widget.current = undefined;
      setToken('');
    };
  }, [siteKey, active]);

  const reset = useCallback(() => {
    if (widget.current) widget.current.api.reset(widget.current.id);

    setToken('');
  }, []);

  return { ref, token, reset };
}
