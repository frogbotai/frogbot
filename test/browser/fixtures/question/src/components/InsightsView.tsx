import { DefaultTemplate } from '@frogbotai/next/templates';
import { SetStepNav } from '@frogbotai/ui';
import type { AdminViewServerProps } from 'frogbot';

export function InsightsView({ initPageResult, params, searchParams, user }: AdminViewServerProps) {
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
      <SetStepNav nav={[{ label: 'Insights' }]} />
      <main>
        <h1>Insights</h1>
      </main>
    </DefaultTemplate>
  );
}
