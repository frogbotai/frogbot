import { getTranslation } from '@payloadcms/translations';
import { Card } from '@payloadcms/ui';
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import type { EntityToGroup } from '@payloadcms/ui/shared';
import { EntityType } from '@payloadcms/ui/shared';
import { attachRegisteredFrogBot } from 'frogbot/internal';
import type { AdminViewServerProps } from 'payload';
import { formatAdminURL } from 'payload/shared';

import SettingIcon from '../../../icons/icons/SettingIcon.js';
import TileIcon from '../../../icons/icons/TileIcon.js';
import { getServerAdapter } from '../../adapters/server.js';
import { splitNavGroups } from '../../elements/Nav/buildNavModel.js';
import { renderNavIcon } from '../../elements/Nav/renderNavIcon.js';
import { SettingsNav } from '../../elements/SettingsNav/index.js';
import type { SettingsEntry } from './resolveSection.js';
import { getSettingsRoutePath, resolveSettingsSection } from './resolveSection.js';

type SettingsViewProps = AdminViewServerProps & { routeSegments?: string[] };

export async function SettingsView(props: SettingsViewProps) {
  const { importMap, initPageResult, params, payload } = props;
  const req = initPageResult.req;
  const routePath = getSettingsRoutePath(
    props.routeSegments ?? (params?.segments as string[] | undefined) ?? [],
  );

  const adminRoute = payload.config.routes.admin;

  if (routePath === '') {
    getServerAdapter().redirect(formatAdminURL({ adminRoute, path: '/settings/collections' }));
  }

  const settings = (
    payload.config.admin as typeof payload.config.admin & { settings?: SettingsEntry[] }
  ).settings;

  const { accessible, matched, title } = await resolveSettingsSection({
    entries: settings,
    req: attachRegisteredFrogBot(req),
    routePath,
  });

  const entries = [
    { icon: <TileIcon size={18} />, label: 'Collections', path: 'collections' },
    ...accessible.map((entry) => ({
      icon: renderNavIcon({ icon: entry.icon, importMap, serverProps: props, size: 18 }) ?? (
        <SettingIcon size={18} />
      ),
      label: entry.label,
      path: entry.path,
    })),
  ];

  const collectionGroups =
    routePath === 'collections'
      ? splitNavGroups({
          entities: payload.config.collections
            .filter(({ slug }) => initPageResult.visibleEntities.collections.includes(slug))
            .map((entity) => ({ entity, type: EntityType.collection }) satisfies EntityToGroup),
          i18n: req.i18n,
          permissions: initPageResult.permissions,
        })
      : { groups: [], ungrouped: [] };

  const renderCollectionList = (entities: typeof collectionGroups.ungrouped) => (
    <ul className="frogbot-settings__collection-list">
      {entities.map(({ label, slug }) => {
        const cardTitle = getTranslation(label, req.i18n);

        return (
          <li key={slug}>
            <Card
              buttonAriaLabel={req.i18n.t('general:showAllLabel', { label: cardTitle })}
              href={formatAdminURL({
                adminRoute: payload.config.routes.admin,
                path: `/collections/${slug}`,
              })}
              id={`card-${slug}`}
              title={cardTitle}
              titleAs="h3"
            />
          </li>
        );
      })}
    </ul>
  );

  const content =
    routePath === 'collections' ? (
      <div className="frogbot-settings__collections">
        {collectionGroups.ungrouped.length > 0 ? (
          <section className="frogbot-settings__collection-group">
            {renderCollectionList(collectionGroups.ungrouped)}
          </section>
        ) : null}
        {collectionGroups.groups.map((group) => (
          <section className="frogbot-settings__collection-group" key={group.label}>
            <h2>{group.label}</h2>
            {renderCollectionList(group.entities)}
          </section>
        ))}
      </div>
    ) : matched ? (
      RenderServerComponent({
        Component: matched.Component,
        importMap,
        serverProps: props,
      })
    ) : (
      <div className="frogbot-settings__not-found">
        <h1>Page not found</h1>
        <p>Sorry, there is nothing to correspond with your request.</p>
      </div>
    );

  return (
    <div className="frogbot-settings-template">
      <SettingsNav
        accountPath={formatAdminURL({
          adminRoute,
          path: payload.config.admin.routes.account,
        })}
        activePath={routePath}
        adminRoute={adminRoute}
        entries={entries}
      />
      <main className="frogbot-settings-template__main">
        <div className="frogbot-settings-template__header">{title}</div>
        <div className="frogbot-settings-template__content">{content}</div>
      </main>
    </div>
  );
}
