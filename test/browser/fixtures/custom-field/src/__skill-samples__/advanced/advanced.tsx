import { DefaultTemplate } from '@frogbotai/next/templates';
import type { AdminViewServerProps } from 'frogbot';
import { notFound, redirect } from 'next/navigation';

export function Welcome() {
  return <h1>Welcome</h1>;
}

export function ReportsView({ initPageResult, params, searchParams, user }: AdminViewServerProps) {
  const { permissions, req, visibleEntities } = initPageResult;

  if (!req.user) {
    redirect('/login');
  }

  if (!permissions.canAccessAdmin) {
    notFound();
  }

  return (
    <DefaultTemplate
      req={req}
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      permissions={permissions}
      searchParams={searchParams}
      user={user}
      visibleEntities={visibleEntities}
    >
      <main>
        <h1>Reports</h1>
      </main>
    </DefaultTemplate>
  );
}
