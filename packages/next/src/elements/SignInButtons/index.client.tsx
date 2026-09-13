'use client';

import {
  DropboxIcon,
  GitHubIcon,
  GoogleIcon,
  type LucideIcon,
  MicrosoftIcon,
  NotionIcon,
  SlackIcon,
  StripeIcon,
  XeroIcon,
  ZoomIcon,
} from '@frogbotai/ui/icons';
import { Button } from '@payloadcms/ui';

const baseClass = 'oauth-login-buttons';
const providerIcons: Record<string, LucideIcon> = {
  dropbox: DropboxIcon,
  github: GitHubIcon,
  google: GoogleIcon,
  microsoft: MicrosoftIcon,
  notion: NotionIcon,
  slack: SlackIcon,
  stripe: StripeIcon,
  xero: XeroIcon,
  zoom: ZoomIcon,
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
            el="link"
            icon={Icon ? <Icon aria-hidden="true" size={20} /> : undefined}
            iconPosition="left"
            iconStyle="none"
            key={method.slug}
            round
            size="large"
            to={`${authorizePath.replace(/\/+$/, '')}/${encodeURIComponent(method.slug)}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
          >
            Continue with {method.label}
          </Button>
        );
      })}
    </div>
  );
}
