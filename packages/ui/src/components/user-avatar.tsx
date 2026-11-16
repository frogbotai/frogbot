'use client';

import { useEffect, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from './avatar.js';

export type UserAvatarProps = {
  className?: string;
  /** The user's email, for Gravatar and for initials when there's no name. */
  email?: string;
  /** Looks the email up on Gravatar, falling back to initials when it has no picture. */
  gravatar?: boolean;
  /** The user's display name, for initials and the image's alt text. */
  name?: string;
  /** Diameter in pixels. Default 24. */
  size?: number;
};

/** One or two initials: `Colby Gilbert` → `CG`, `ro@example.com` → `R`. */
export function userInitials(name: string | undefined, email?: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);

  if (words.length) {
    return words
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join('');
  }

  return (email?.trim()[0] ?? '?').toUpperCase();
}

async function gravatarURL(email: string, size: number): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;

  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return `https://gravatar.com/avatar/${hash}?d=404&s=${size * 2}`;
}

/** A round user picture: Gravatar when asked for and found, otherwise initials. */
export function UserAvatar({ className, email, gravatar, name, size = 24 }: UserAvatarProps) {
  const [src, setSrc] = useState<string>();

  useEffect(() => {
    let current = true;

    if (gravatar && email) {
      void gravatarURL(email, size).then((url) => {
        if (current) setSrc(url);
      });
    }

    return () => {
      current = false;
    };
  }, [email, gravatar, size]);

  return (
    <Avatar
      className={['fb-user-avatar', className].filter(Boolean).join(' ')}
      style={{ fontSize: Math.max(9, Math.round(size * 0.42)), height: size, width: size }}
    >
      {src ? <AvatarImage alt={name ?? email ?? ''} src={src} /> : null}
      <AvatarFallback aria-label={name ?? email} delayMs={src ? 600 : 0}>
        {userInitials(name, email)}
      </AvatarFallback>
    </Avatar>
  );
}
