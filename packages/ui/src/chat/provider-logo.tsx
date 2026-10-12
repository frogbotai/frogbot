import IconBase from '../icons/IconBase.js';
import SparkleIcon from '../icons/icons/SparkleIcon.js';
import { providers } from './providers.js';

export type ProviderLogoProps = { provider?: string; className?: string };

export function ProviderLogo({ provider, className }: ProviderLogoProps) {
  const logo =
    provider && Object.hasOwn(providers, provider) ? providers[provider].logo : undefined;

  const classes = className ? `fb-model-selector__logo ${className}` : 'fb-model-selector__logo';

  return logo ? (
    <IconBase
      aria-hidden="true"
      className={classes}
      iconNode={logo.nodes}
      viewBox={logo.viewBox}
      stroke="none"
    />
  ) : (
    <SparkleIcon aria-hidden="true" className={classes} />
  );
}
