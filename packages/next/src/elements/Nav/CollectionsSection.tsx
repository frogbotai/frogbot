import { FolderIcon } from '@frogbotai/ui/icons';
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import type { ServerProps } from 'payload';

import { buildCollectionGroups } from './buildNavModel.js';
import { NavItem } from './NavItem.js';
import { NavSection } from './NavSection.js';

export type CollectionsSectionProps = ServerProps;

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

  return (
    <NavSection id="collections" title={i18n.t('general:collections')}>
      {groups.map((group) => (
        <div className="frogbot-collections-section__group" key={group.label}>
          <div className="frogbot-collections-section__group-label">{group.label}</div>
          <div className="frogbot-collections-section__items">
            {group.items.map((item) => (
              <NavItem
                className="fb-slide-right-1"
                icon={
                  item.icon
                    ? RenderServerComponent({
                        Component: item.icon,
                        clientProps: { className: 'frogbot-nav-item__icon-svg', size: 20 },
                        importMap: payload.importMap,
                        serverProps: { i18n, payload, permissions, visibleEntities },
                      })
                    : FolderIcon
                }
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
