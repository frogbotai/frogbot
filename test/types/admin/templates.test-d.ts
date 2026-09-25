import { DefaultTemplate, type DefaultTemplateProps } from '@frogbotai/next/templates';
import type { AdminViewServerProps, FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

type ComponentProps<T> = T extends (props: infer TProps) => unknown ? TProps : never;

expectTypeOf<ComponentProps<typeof DefaultTemplate>>().toEqualTypeOf<DefaultTemplateProps>();
expectTypeOf<DefaultTemplateProps['req']>().toEqualTypeOf<FrogBotRequest>();

expectTypeOf<'payload'>().not.toExtend<keyof DefaultTemplateProps>();

export function ReportsView({ initPageResult, params, searchParams, user }: AdminViewServerProps) {
  return DefaultTemplate({
    children: 'Reports',
    i18n: initPageResult.req.i18n,
    locale: initPageResult.locale,
    params,
    permissions: initPageResult.permissions,
    req: initPageResult.req,
    searchParams,
    user,
    visibleEntities: initPageResult.visibleEntities,
  });
}
