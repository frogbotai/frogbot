import IconBase from '../icons/IconBase.js';
import SparkleIcon from '../icons/icons/SparkleIcon.js';
import { providerLogos } from './provider-logos.js';

export function ProviderLogo({ provider }: { provider?: string }) {
  const logo =
    provider && Object.hasOwn(providerLogos, provider) ? providerLogos[provider] : undefined;

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
