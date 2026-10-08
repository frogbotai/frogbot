'use client';

import { LinkSquareIcon } from '@frogbotai/ui/icons';
import { useState } from 'react';

type LogoState = { src: string; status: 'failed' | 'loaded' };

export function PieceLogo({ src }: { src?: string }) {
  const [state, setState] = useState<LogoState>();
  const status = state?.src === src ? state?.status : undefined;
  const settle = (image: HTMLImageElement) => {
    if (!src || !image.complete) return;
    const next = image.naturalWidth > 0 ? 'loaded' : 'failed';

    if (status !== next) setState({ src, status: next });
  };

  return (
    <span className="frogbot-connections__icon">
      {src && status !== 'failed' && (
        <img
          ref={(image) => {
            if (image) settle(image);
          }}
          alt=""
          className="frogbot-connections__logo"
          hidden={status !== 'loaded'}
          src={src}
          onError={() => setState({ src, status: 'failed' })}
          onLoad={(event) => settle(event.currentTarget)}
        />
      )}
      {status !== 'loaded' && <LinkSquareIcon size={20} />}
    </span>
  );
}
