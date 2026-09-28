import { FolderIcon } from '@frogbotai/ui/icons';
import { iconRegistry, isIconName } from '@frogbotai/ui/icons/registry';
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import type { CustomComponent, ServerProps } from 'payload';

import { buildCollectionGroups } from './buildNavModel.js';
import { NavItem } from './NavItem.js';
import { NavSection } from './NavSection.js';

export type CollectionsSectionProps = ServerProps;

const iconClassName = 'frogbot-nav-item__icon-svg';

export function CollectionsSection({
  i18n,
  payload,
  permissions,
  visibleEntities,
}: CollectionsSectionProps) {
  if (!payload?.config || !permissions || !visibleEntities) return null;

  const { groups } = buildCollectionGroups({
    config: payload.config,
    i18n,
    permissions,
    visibleEntities,
  });

  const renderIcon = (icon?: CustomComponent | string) => {
    if (typeof icon === 'string' && isIconName(icon)) {
      const Icon = iconRegistry[icon];

      return <Icon className={iconClassName} size={20} />;
    }

    if (icon && (typeof icon !== 'string' || icon.includes('#'))) {
      return RenderServerComponent({
        Component: icon,
        clientProps: { className: iconClassName, size: 20 },
        importMap: payload.importMap,
        serverProps: { i18n, payload, permissions, visibleEntities },
      });
    }

    return <FolderIcon className={iconClassName} size={20} />;
  };

  return (
    <NavSection id="collections" title={i18n.t('general:collections')}>
      {groups.map((group) => (
        <div className="frogbot-collections-section__group" key={group.label}>
          <div className="frogbot-collections-section__group-label">{group.label}</div>
          <div className="frogbot-collections-section__items">
            {group.items.map((item) => (
              <NavItem
                className="fb-slide-right-1"
                icon={renderIcon(item.icon)}
                key={item.path}
                label={item.label}
                path={item.path}
              />
            ))}
          </div>
        </div>
      ))}
    </NavSection>
  );
}
