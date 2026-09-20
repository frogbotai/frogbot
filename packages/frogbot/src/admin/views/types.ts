import type * as Payload from 'payload';
import type { ClientField, Field } from 'payload';

import type { FrogbotTypes } from '../../types/generated.js';
import type { Sort, Where } from '../../types/payload.js';
import type { FrogbotRequest } from '../../types/request.js';
import type { FrogbotComponent } from '../types.js';

type WithoutPayload<T> = Omit<T, 'payload'>;

type WithoutPayloadOrGlobal<T> = Omit<T, 'globalConfig' | 'payload'>;

export type ViewAccess = (args: { req: FrogbotRequest }) => boolean | Promise<boolean>;

export type ViewFilter = Where | ((args: { req: FrogbotRequest }) => Promise<Where> | Where);

export type ViewComponents = {
  actions?: FrogbotComponent[];
  afterView?: FrogbotComponent[];
  beforeView?: FrogbotComponent[];
  menuItems?: FrogbotComponent[];
};

export type ViewPagination = {
  defaultLimit?: number;
  limits?: number[];
};

type ViewConfig = {
  access?: ViewAccess;
  defaultFields?: string[];
  defaultSort?: Sort;
  filter?: ViewFilter;
  label?: string;
  pagination?: ViewPagination;
  searchableFields?: string[];
  slug?: string;
};

export type ListView = ViewConfig & {
  components?: ViewComponents & {
    afterTable?: FrogbotComponent[];
    beforeTable?: FrogbotComponent[];
  };
  groupBy?: boolean;
  type: 'list';
};

export type BoardView = ViewConfig & {
  components?: ViewComponents & {
    afterColumns?: FrogbotComponent[];
    beforeColumns?: FrogbotComponent[];
    Card?: FrogbotComponent;
    ColumnHeader?: FrogbotComponent;
  };
  cover?: string;
  groupBy?: string;
  type: 'board';
};

export type CalendarMode = 'day' | 'month' | 'week';

export type CalendarView = ViewConfig & {
  color?: string;
  components?: ViewComponents & {
    afterCalendar?: FrogbotComponent[];
    beforeCalendar?: FrogbotComponent[];
    Event?: FrogbotComponent;
  };
  end?: string;
  modes?: CalendarMode[];
  snap?: number;
  start: string;
  type: 'calendar';
};

export type CustomView = ViewConfig & {
  component: FrogbotComponent;
  components?: ViewComponents;
  shell?: boolean;
  type: 'custom';
};

export type CollectionView = BoardView | CalendarView | CustomView | ListView;

export type CollectionViewMetadata = Omit<
  CollectionView,
  'access' | 'component' | 'components' | 'filter'
> & {
  label: string;
  path: string;
  slug: string;
};

export type InitPageResult = Omit<Payload.InitPageResult, 'globalConfig' | 'req'> & {
  req: FrogbotRequest;
};

export type AdminViewServerPropsOnly = Omit<
  Payload.AdminViewServerPropsOnly,
  'globalConfig' | 'initPageResult' | 'payload'
> & {
  readonly initPageResult: InitPageResult;
};

export type AdminViewServerProps = Payload.AdminViewClientProps & AdminViewServerPropsOnly;

export type DocumentViewServerPropsOnly = Omit<
  Payload.DocumentViewServerPropsOnly,
  'initPageResult' | 'payload'
> & {
  initPageResult: InitPageResult;
};

export type DocumentViewServerProps = Payload.DocumentViewClientProps & DocumentViewServerPropsOnly;

export type DocumentTabServerPropsOnly = Omit<
  Payload.DocumentTabServerPropsOnly,
  'globalConfig' | 'payload' | 'req'
> & {
  readonly req: FrogbotRequest;
};

export type DocumentTabServerProps = Payload.DocumentTabClientProps & DocumentTabServerPropsOnly;

export type DocumentTabCondition = (
  args: Omit<Parameters<Payload.DocumentTabCondition>[0], 'globalConfig' | 'req'> & {
    req: FrogbotRequest;
  },
) => boolean;

export type DocumentTabConfig = Omit<Payload.DocumentTabConfig, 'condition'> & {
  readonly condition?: DocumentTabCondition;
};

export type ListViewServerPropsOnly = WithoutPayload<Payload.ListViewServerPropsOnly>;
export type ListViewServerProps = Payload.ListViewClientProps & ListViewServerPropsOnly;

export type BeforeListServerPropsOnly = WithoutPayload<Payload.BeforeListServerPropsOnly>;
export type BeforeListServerProps = Payload.BeforeListClientProps & BeforeListServerPropsOnly;

export type BeforeListTableServerPropsOnly = WithoutPayload<Payload.BeforeListTableServerPropsOnly>;
export type BeforeListTableServerProps = Payload.BeforeListTableClientProps &
  BeforeListTableServerPropsOnly;

export type AfterListServerPropsOnly = WithoutPayload<Payload.AfterListServerPropsOnly>;
export type AfterListServerProps = Payload.AfterListClientProps & AfterListServerPropsOnly;

export type AfterListTableServerPropsOnly = WithoutPayload<Payload.AfterListTableServerPropsOnly>;
export type AfterListTableServerProps = Payload.AfterListTableClientProps &
  AfterListTableServerPropsOnly;

export type FolderListViewServerPropsOnly = WithoutPayload<Payload.FolderListViewServerPropsOnly>;
export type FolderListViewServerProps = Payload.FolderListViewClientProps &
  FolderListViewServerPropsOnly;

export type BeforeFolderListServerPropsOnly =
  WithoutPayload<Payload.BeforeFolderListServerPropsOnly>;
export type BeforeFolderListServerProps = Payload.BeforeFolderListClientProps &
  BeforeFolderListServerPropsOnly;

export type BeforeFolderListTableServerPropsOnly =
  WithoutPayload<Payload.BeforeFolderListTableServerPropsOnly>;
export type BeforeFolderListTableServerProps = Payload.BeforeFolderListTableClientProps &
  BeforeFolderListTableServerPropsOnly;

export type AfterFolderListServerPropsOnly = WithoutPayload<Payload.AfterFolderListServerPropsOnly>;
export type AfterFolderListServerProps = Payload.AfterFolderListClientProps &
  AfterFolderListServerPropsOnly;

export type AfterFolderListTableServerPropsOnly =
  WithoutPayload<Payload.AfterFolderListTableServerPropsOnly>;
export type AfterFolderListTableServerProps = Payload.AfterFolderListTableClientProps &
  AfterFolderListTableServerPropsOnly;

export type BeforeDocumentControlsServerPropsOnly =
  WithoutPayloadOrGlobal<Payload.BeforeDocumentControlsServerPropsOnly>;
export type BeforeDocumentControlsServerProps = Payload.BeforeDocumentControlsClientProps &
  BeforeDocumentControlsServerPropsOnly;

export type ViewDescriptionServerPropsOnly =
  WithoutPayloadOrGlobal<Payload.ViewDescriptionServerPropsOnly>;
export type ViewDescriptionServerProps = Payload.ViewDescriptionClientProps &
  ViewDescriptionServerPropsOnly;

export type EditMenuItemsServerPropsOnly = WithoutPayload<Payload.EditMenuItemsServerPropsOnly>;
export type EditMenuItemsServerProps = Payload.EditMenuItemsClientProps &
  EditMenuItemsServerPropsOnly;

export type PreviewButtonServerPropsOnly = WithoutPayload<Payload.PreviewButtonServerPropsOnly>;
export type PreviewButtonServerProps = Payload.PreviewButtonClientProps &
  PreviewButtonServerPropsOnly;

export type PublishButtonServerPropsOnly = WithoutPayload<Payload.PublishButtonServerPropsOnly>;
export type PublishButtonServerProps = Payload.PublishButtonClientProps &
  PublishButtonServerPropsOnly;

export type SaveButtonServerPropsOnly = WithoutPayload<Payload.SaveButtonServerPropsOnly>;
export type SaveButtonServerProps = Payload.SaveButtonClientProps & SaveButtonServerPropsOnly;

export type SaveDraftButtonServerPropsOnly = WithoutPayload<Payload.SaveDraftButtonServerPropsOnly>;
export type SaveDraftButtonServerProps = Payload.SaveDraftButtonClientProps &
  SaveDraftButtonServerPropsOnly;

export type UnpublishButtonServerPropsOnly = WithoutPayload<Payload.UnpublishButtonServerPropsOnly>;
export type UnpublishButtonServerProps = Payload.UnpublishButtonClientProps &
  UnpublishButtonServerPropsOnly;

export type DefaultCellComponentProps<
  TField extends ClientField = ClientField,
  TCellData = undefined,
> = Payload.DefaultCellComponentProps<TField, TCellData>;

export type DefaultServerCellComponentProps<
  TField extends ClientField = ClientField,
  TCellData = any,
> = Omit<Payload.DefaultServerCellComponentProps<TField, TCellData>, 'payload'>;

export type WidgetWidth = Payload.WidgetWidth;

type TypedWidget = FrogbotTypes['widgets'];
type WidgetSlug = Extract<keyof TypedWidget, string>;

type DataFromWidgetSlug<TSlug extends WidgetSlug> = TypedWidget[TSlug] extends {
  data?: infer TData;
}
  ? TData
  : TypedWidget[TSlug];

export type WidgetInstance<TSlug extends WidgetSlug = WidgetSlug> = TSlug extends WidgetSlug
  ? {
      data?: DataFromWidgetSlug<TSlug> extends Record<string, unknown>
        ? DataFromWidgetSlug<TSlug>
        : Record<string, unknown>;
      widgetSlug: TSlug;
      width: [
        Extract<
          TypedWidget[TSlug] extends { width: infer TWidth } ? TWidth : WidgetWidth,
          WidgetWidth
        >,
      ] extends [never]
        ? WidgetWidth
        : Extract<
            TypedWidget[TSlug] extends { width: infer TWidth } ? TWidth : WidgetWidth,
            WidgetWidth
          >;
    }
  : never;

export type Widget = {
  Component: FrogbotComponent;
  fields?: Field[];
  label?: Payload.Widget['label'];
  maxWidth?: WidgetWidth;
  minWidth?: WidgetWidth;
  slug: string;
};

export type DashboardConfig = {
  defaultLayout?:
    | ((args: { req: FrogbotRequest }) => Array<WidgetInstance> | Promise<Array<WidgetInstance>>)
    | Array<WidgetInstance>;
  widgets: Array<Widget>;
};

type WidgetDataFromWidget<TWidget> = TWidget extends { data?: infer TData } ? TData : never;

type WidgetSlugFromWidget<TWidget extends { data?: unknown }> = {
  [TSlug in WidgetSlug]: TypedWidget[TSlug] extends TWidget ? TSlug : never;
}[WidgetSlug];

export type WidgetServerProps<TWidget extends { data?: unknown } | never = never> = {
  widgetData?: [TWidget] extends [never]
    ? Record<string, unknown>
    : WidgetDataFromWidget<Exclude<TWidget, never>> extends Record<string, unknown>
      ? WidgetDataFromWidget<Exclude<TWidget, never>>
      : Record<string, unknown>;
  widgetSlug: [TWidget] extends [never]
    ? string
    : [WidgetSlugFromWidget<{ data?: unknown } & Exclude<TWidget, never>>] extends [never]
      ? string
      : WidgetSlugFromWidget<{ data?: unknown } & Exclude<TWidget, never>>;
} & Omit<Payload.WidgetServerProps<TWidget>, 'req' | 'widgetData' | 'widgetSlug'> & {
    req: FrogbotRequest;
  };

export type {
  AdminViewClientProps,
  AfterFolderListClientProps,
  AfterFolderListTableClientProps,
  AfterListClientProps,
  AfterListTableClientProps,
  BeforeDocumentControlsClientProps,
  BeforeFolderListClientProps,
  BeforeFolderListTableClientProps,
  BeforeListClientProps,
  BeforeListTableClientProps,
  DocumentSubViewTypes,
  DocumentTabClientProps,
  DocumentViewClientProps,
  EditMenuItemsClientProps,
  EditViewProps,
  FolderListViewClientProps,
  FolderListViewSlots,
  FolderListViewSlotSharedClientProps,
  ListViewClientProps,
  ListViewSlots,
  ListViewSlotSharedClientProps,
  PreviewButtonClientProps,
  PublishButtonClientProps,
  RenderDocumentVersionsProperties,
  SaveButtonClientProps,
  SaveDraftButtonClientProps,
  UnpublishButtonClientProps,
  ViewDescriptionClientProps,
  ViewTypes,
} from 'payload';
