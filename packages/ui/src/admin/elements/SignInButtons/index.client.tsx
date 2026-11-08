'use client';

import { Button } from '@payloadcms/ui';

import BrandDropboxIcon from '../../../icons/icons/BrandDropboxIcon.js';
import BrandGitHubIcon from '../../../icons/icons/BrandGitHubIcon.js';
import BrandGoogleIcon from '../../../icons/icons/BrandGoogleIcon.js';
import BrandMicrosoftIcon from '../../../icons/icons/BrandMicrosoftIcon.js';
import BrandNotionIcon from '../../../icons/icons/BrandNotionIcon.js';
import BrandSlackIcon from '../../../icons/icons/BrandSlackIcon.js';
import BrandStripeIcon from '../../../icons/icons/BrandStripeIcon.js';
import BrandXeroIcon from '../../../icons/icons/BrandXeroIcon.js';
import BrandZoomIcon from '../../../icons/icons/BrandZoomIcon.js';
import { type LucideIcon } from '../../../icons/types.js';

const baseClass = 'oauth-login-buttons';
const providerIcons: Record<string, LucideIcon> = {
  dropbox: BrandDropboxIcon,
  github: BrandGitHubIcon,
  google: BrandGoogleIcon,
  microsoft: BrandMicrosoftIcon,
  notion: BrandNotionIcon,
  slack: BrandSlackIcon,
  stripe: BrandStripeIcon,
  xero: BrandXeroIcon,
  zoom: BrandZoomIcon,
};

export type SignInButtonsClientProps = {
  methods: { slug: string; piece: string; label: string }[];
  authorizePath: string;
  returnTo?: string;
  showDivider?: boolean;
};

export function SignInButtonsClient({
  methods,
  authorizePath,
  returnTo,
  showDivider = true,
}: SignInButtonsClientProps) {
  if (!methods.length) return null;

  return (
    <div className={baseClass}>
      {showDivider && (
        <div className={`${baseClass}__separator`}>
          <span className={`${baseClass}__rule`} />
          <span className={`${baseClass}__label`}>or</span>
          <span className={`${baseClass}__rule`} />
        </div>
      )}
      {methods.map((method) => {
        const Icon = providerIcons[method.piece];

        return (
          <Button
            buttonStyle="secondary"
            el="anchor"
            icon={Icon ? <Icon aria-hidden="true" size={16} /> : undefined}
            iconPosition="left"
            key={method.slug}
            size="large"
            url={`${authorizePath.replace(/\/+$/, '')}/${encodeURIComponent(method.slug)}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
          >
            Continue with {method.label}
          </Button>
        );
      })}
    </div>
  );
}
