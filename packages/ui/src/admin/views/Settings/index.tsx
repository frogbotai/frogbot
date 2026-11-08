import { getTranslation } from '@payloadcms/translations';
import { Card, Gutter, SetStepNav } from '@payloadcms/ui';
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import type { EntityToGroup } from '@payloadcms/ui/shared';
import { attachRegisteredFrogBot } from 'frogbot/internal';
import type { AdminViewServerProps } from 'payload';
import { EntityType } from 'payload/shared';
import { formatAdminURL } from 'payload/shared';

import { splitNavGroups } from '../../elements/Nav/buildNavModel.js';
import { DefaultTemplate } from '../../templates/Default/index.js';
import {
  getSettingsEntries,
  getSettingsRoutePath,
  resolveSettingsSection,
} from './resolveSection.js';

type SettingsViewProps = AdminViewServerProps & { routeSegments?: string[] };

/** FrogBot's Settings pages, in the default template whose nav draws the Settings sidebar. */
export async function SettingsView(props: SettingsViewProps) {
  const { importMap, initPageResult, params, payload, searchParams } = props;
  const req = initPageResult.req;
  const routePath = getSettingsRoutePath(
    props.routeSegments ?? (params?.segments as string[] | undefined) ?? [],
  );

  const adminRoute = payload.config.routes.admin;

  if (routePath === '') {
    props.server.redirect(formatAdminURL({ adminRoute, path: '/settings/collections' }));
  }

  const frogbotReq = attachRegisteredFrogBot(req);

  const { matched, title } = await resolveSettingsSection({
    entries: getSettingsEntries(payload.config),
    req: frogbotReq,
    routePath,
  });

  const collectionGroups =
    routePath === 'collections'
      ? splitNavGroups({
          entities: payload.config.collections
            .filter(
              ({ admin, slug }) =>
                initPageResult.visibleEntities.collections.includes(slug) &&
                !(admin as { settings?: boolean }).settings,
            )
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
    <DefaultTemplate
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      permissions={initPageResult.permissions}
      req={frogbotReq}
      searchParams={searchParams}
      user={initPageResult.req.user ?? undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <SetStepNav nav={[{ label: title }]} />
      <Gutter className="frogbot-settings">{content}</Gutter>
    </DefaultTemplate>
  );
}
