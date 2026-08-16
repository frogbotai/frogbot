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

import './index.scss';

const baseClass = 'oauth-login-buttons';

const PROVIDER_ICONS: Record<string, LucideIcon> = {
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

export type OAuthLoginButtonsProps = {
  authorizePath: string;
  providers: Array<{ id: string; label: string }>;
  showDivider?: boolean;
};

function ProviderIcon({ id }: { id: string }) {
  const Icon = PROVIDER_ICONS[id.split('-')[0]!];
  if (!Icon) return null;
  return <Icon aria-hidden="true" size={20} />;
}

export function OAuthLoginButtons({ authorizePath, providers, showDivider = true }: OAuthLoginButtonsProps) {
  if (providers.length === 0) return null;
  return (
    <div className={baseClass}>
      {showDivider && (
        <div className={`${baseClass}__separator`}>
          <span className={`${baseClass}__rule`} />
          <span className={`${baseClass}__label`}>or</span>
          <span className={`${baseClass}__rule`} />
        </div>
      )}
      {providers.map((provider) => (
        <Button
          buttonStyle="secondary"
          el="link"
          icon={<ProviderIcon id={provider.id} />}
          iconPosition="left"
          iconStyle="none"
          key={provider.id}
          round
          size="large"
          to={authorizePath.replace(':provider', encodeURIComponent(provider.id))}
        >
          Continue with {provider.label}
        </Button>
      ))}
    </div>
  );
}
