import { FolderIcon } from '@frogbotai/ui/icons';
import type { CustomComponent, ServerProps } from 'payload';

import { buildCollectionGroups } from './buildNavModel.js';
import { NavItem } from './NavItem.js';
import { NavSection } from './NavSection.js';
import { renderNavIcon } from './renderNavIcon.js';

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

  const renderIcon = (icon?: CustomComponent | string) =>
    renderNavIcon({
      className: iconClassName,
      icon,
      importMap: payload.importMap,
      serverProps: { i18n, payload, permissions, visibleEntities },
      size: 20,
    }) ?? <FolderIcon className={iconClassName} size={20} />;

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
