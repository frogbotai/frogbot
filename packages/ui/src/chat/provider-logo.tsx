import IconBase from '../icons/IconBase.js';
import SparkleIcon from '../icons/icons/SparkleIcon.js';
import { providers } from './providers.js';

export function ProviderLogo({ provider }: { provider?: string }) {
  const logo =
    provider && Object.hasOwn(providers, provider) ? providers[provider].logo : undefined;

  return logo ? (
    <IconBase
      aria-hidden="true"
      className="fb-model-selector__logo"
      iconNode={logo.nodes}
      viewBox={logo.viewBox}
      stroke="none"
    />
  ) : (
    <SparkleIcon aria-hidden="true" className="fb-model-selector__logo" />
  );
}
