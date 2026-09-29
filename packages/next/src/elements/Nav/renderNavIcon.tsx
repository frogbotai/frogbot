import { iconRegistry, isIconName } from '@frogbotai/ui/icons/registry';
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import type { CustomComponent, ImportMap } from 'payload';
import type { ReactNode } from 'react';

export type RenderNavIconArgs = {
  className?: string;
  icon?: CustomComponent | string;
  importMap: ImportMap;
  serverProps: object;
  size: number;
};

export function renderNavIcon({
  className,
  icon,
  importMap,
  serverProps,
  size,
}: RenderNavIconArgs): ReactNode {
  if (typeof icon === 'string' && isIconName(icon)) {
    const Icon = iconRegistry[icon];

    return <Icon className={className} size={size} />;
  }

  if (icon && (typeof icon !== 'string' || icon.includes('#'))) {
    return RenderServerComponent({
      Component: icon,
      clientProps: { className, size },
      importMap,
      serverProps,
    });
  }

  return undefined;
}
