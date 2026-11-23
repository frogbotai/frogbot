'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { useState } from 'react';

import ImageIcon from '../icons/icons/ImageIcon.js';

export type MediaProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Text for screen readers. */
  alt: string;
  /** A label in the bottom-right corner, such as a duration or score. */
  badge?: ReactNode;
  /** Shape of the frame, so a grid stays even while images load. Default `16/9`. */
  ratio?: '1/1' | '16/9' | '4/3' | '9/16';
  /** The image URL. A missing or broken image shows a neutral placeholder. */
  src?: null | string;
};

/** An image in a fixed-shape frame, with a placeholder when it's missing and an optional corner label. */
export function Media({ alt, badge, className, ratio = '16/9', src, style, ...props }: MediaProps) {
  const [failed, setFailed] = useState<string>();
  const shown = src && src !== failed;

  return (
    <div
      className={`fb-media${className ? ` ${className}` : ''}`}
      {...props}
      style={{ aspectRatio: ratio.replace('/', ' / '), ...style }}
    >
      {shown ? (
        <img
          alt={alt}
          className="fb-media__image"
          loading="lazy"
          onError={() => setFailed(src)}
          src={src}
        />
      ) : (
        <div aria-label={alt} className="fb-media__placeholder" role="img">
          <ImageIcon aria-hidden />
        </div>
      )}
      {badge !== undefined && <span className="fb-media__badge">{badge}</span>}
    </div>
  );
}
