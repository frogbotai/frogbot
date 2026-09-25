import type {
  AdminViewServerProps,
  DashboardConfig,
  DefaultCellComponentProps,
  DefaultServerCellComponentProps,
  DocumentTabServerProps,
  DocumentViewServerProps,
  FrogBotRequest,
  ListViewServerProps,
  RootAdminConfig,
  SaveButtonServerProps,
  TextFieldClientComponent,
  TextFieldServerComponent,
  TextFieldServerProps,
  WidgetInstance,
  WidgetServerProps,
} from 'frogbot';
import type { TextFieldClientComponent as PayloadTextFieldClientComponent } from 'payload';
import { expectTypeOf } from 'vitest';

import type { WelcomeWidget } from './generated.js';

type ComponentProps<T> = T extends (props: infer TProps) => unknown ? TProps : never;

type TextServerComponentProps = ComponentProps<TextFieldServerComponent>;

expectTypeOf<TextServerComponentProps>().toEqualTypeOf<TextFieldServerProps>();
expectTypeOf<TextServerComponentProps['req']>().toEqualTypeOf<FrogBotRequest>();
expectTypeOf<TextFieldClientComponent>().toEqualTypeOf<PayloadTextFieldClientComponent>();

declare const textProps: TextFieldServerProps;

export const textFrogBot = textProps.req.frogbot;

// @ts-expect-error FrogBot server field props do not expose the underlying runtime.
export const textPayload = textProps.payload;

// @ts-expect-error FrogBot requests expose req.frogbot instead.
export const textRequestPayload = textProps.req.payload;

expectTypeOf<AdminViewServerProps['initPageResult']['req']>().toEqualTypeOf<FrogBotRequest>();
expectTypeOf<DocumentViewServerProps['initPageResult']['req']>().toEqualTypeOf<FrogBotRequest>();
expectTypeOf<DocumentTabServerProps['req']>().toEqualTypeOf<FrogBotRequest>();

declare const adminViewProps: AdminViewServerProps;

// @ts-expect-error Nested view requests expose req.frogbot instead.
export const adminViewPayload = adminViewProps.initPageResult.req.payload;

expectTypeOf<ListViewServerProps>().not.toHaveProperty('req');
expectTypeOf<ListViewServerProps>().not.toHaveProperty('payload');
expectTypeOf<SaveButtonServerProps>().not.toHaveProperty('req');
expectTypeOf<SaveButtonServerProps>().not.toHaveProperty('payload');
expectTypeOf<DefaultCellComponentProps>().not.toHaveProperty('req');
expectTypeOf<DefaultServerCellComponentProps>().not.toHaveProperty('payload');

type WelcomeWidgetProps = WidgetServerProps<WelcomeWidget>;

expectTypeOf<WelcomeWidgetProps['req']>().toEqualTypeOf<FrogBotRequest>();
expectTypeOf<WelcomeWidgetProps['widgetSlug']>().toEqualTypeOf<'welcome'>();
expectTypeOf<WelcomeWidgetProps['widgetData']>().toEqualTypeOf<
  | {
      heading: string;
    }
  | undefined
>();

expectTypeOf<WidgetInstance<'welcome'>>().toEqualTypeOf<{
  data?: {
    heading: string;
  };
  widgetSlug: 'welcome';
  width: 'medium' | 'small';
}>();

const dashboard = {
  defaultLayout: ({ req }) => {
    expectTypeOf(req.frogbot).toMatchTypeOf<FrogBotRequest['frogbot']>();

    return [{ data: { heading: 'Welcome' }, widgetSlug: 'welcome', width: 'small' }];
  },
  widgets: [{ Component: './WelcomeWidget#WelcomeWidget', slug: 'welcome' }],
} satisfies DashboardConfig;

const admin = { dashboard } satisfies RootAdminConfig;

expectTypeOf(admin.dashboard).toMatchTypeOf<DashboardConfig>();
