import { DefaultTemplate } from '@frogbotai/next/templates';
import type { AdminViewServerProps } from 'frogbot';

export function ReportsView({ initPageResult, params, searchParams, user }: AdminViewServerProps) {
  const { req } = initPageResult;

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      permissions={initPageResult.permissions}
      req={req}
      searchParams={searchParams}
      user={user}
      visibleEntities={initPageResult.visibleEntities}
    >
      <main>
        <h1>Reports</h1>
        <p data-testid="reports-collections">{Object.keys(req.frogbot.collections).length}</p>
      </main>
    </DefaultTemplate>
  );
}
