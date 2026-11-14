import type * as Payload from 'payload';
import type { ClientField } from 'payload';

import type { Field } from '../../fields/config/types.js';
import type { FrogBotTypes } from '../../types/generated.js';
import type { Sort, Where } from '../../types/payload.js';
import type { FrogBotRequest } from '../../types/request.js';
import type { AdminIcon, FrogBotComponent } from '../types.js';
import type { SummaryOperation } from './summary.js';

type WithoutPayload<T> = Omit<T, 'payload'>;

type WithoutPayloadOrGlobal<T> = Omit<T, 'globalConfig' | 'payload'>;

export type ViewAccess = (args: { req: FrogBotRequest }) => boolean | Promise<boolean>;

/** The view's fixed filter. Plain data, so a view can be stored as a record. */
export type ViewFilter = Where;

export type ViewComponents = {
  actions?: FrogBotComponent[];
  afterView?: FrogBotComponent[];
  beforeView?: FrogBotComponent[];
  menuItems?: FrogBotComponent[];
  /** Replaces the empty state shown when the view has no records. */
  NoResults?: FrogBotComponent;
  toolbar?: FrogBotComponent[];
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
  icon?: AdminIcon;
  label?: string;
  pagination?: ViewPagination;
  searchableFields?: string[];
  slug?: string;
};

export type ListView = ViewConfig & {
  components?: ViewComponents & {
    afterTable?: FrogBotComponent[];
    beforeTable?: FrogBotComponent[];
  };
  /**
   * Lets people edit cells in place, without opening the record. `true` makes every writable
   * column of a supported type editable; an array names the fields (names or dot paths) that are.
   * Text, textarea, email, number, select, checkbox, date, single relationships and FrogBot's
   * field kinds edit in the cell; other fields, `hasMany` fields and the linked first column open
   * the record. Off by default.
   */
  editable?: boolean | string[];
  /** The field the list opens grouped by, as on a board. A person's own grouping wins. */
  groupBy?: string;
  /**
   * Each column's default footer total, keyed by field path, such as `{ amount: 'sum' }`. Number
   * fields take every operation, date fields `count`, `min` and `max`, other fields `count`.
   * People can change a column's total; their choice is saved per user and view.
   */
  summary?: Record<string, SummaryOperation>;
  type: 'list';
};

/** The keys every view that draws cards shares: board and gallery. */
export type CardViewConfig = {
  /**
   * Card image for this view only.
   * - string: an upload field, overriding the collection's `useAsThumbnail`.
   * - false: no image on this view's cards.
   * - not set (default): the collection's `useAsThumbnail`, with Payload's defaults.
   */
  useAsThumbnail?: false | string;
  /** 'cover' (default) fills and crops, for photos. 'contain' fits without cropping, for logos. */
  thumbnailFit?: 'contain' | 'cover';
};

export type BoardView = ViewConfig &
  CardViewConfig & {
    components?: ViewComponents & {
      afterColumns?: FrogBotComponent[];
      beforeColumns?: FrogBotComponent[];
      /** Replaces each card's body. It receives the document as `row`. */
      Card?: FrogBotComponent;
      ColumnHeader?: FrogBotComponent;
    };
    groupBy?: string;
    type: 'board';
  };

export type GalleryView = ViewConfig &
  CardViewConfig & {
    components?: ViewComponents & {
      afterCards?: FrogBotComponent[];
      beforeCards?: FrogBotComponent[];
      /** Replaces each card's body. It receives the document as `row`. */
      Card?: FrogBotComponent;
    };
    type: 'gallery';
  };

export type CalendarMode = 'day' | 'month' | 'week';

export type CalendarView = ViewConfig & {
  color?: string;
  components?: ViewComponents & {
    afterCalendar?: FrogBotComponent[];
    beforeCalendar?: FrogBotComponent[];
    Event?: FrogBotComponent;
  };
  end?: string;
  modes?: CalendarMode[];
  snap?: number;
  start: string;
  type: 'calendar';
};

export type TimelineScale = 'day' | 'month' | 'week';

export type TimelineView = ViewConfig & {
  /** A select or radio field whose option colors tint each bar. */
  color?: string;
  components?: ViewComponents & {
    afterTimeline?: FrogBotComponent[];
    beforeTimeline?: FrogBotComponent[];
    /** Replaces each bar's body. It receives the document as `row`. */
    Bar?: FrogBotComponent;
  };
  /** The date field each bar ends on. Without it, every bar is one day long. */
  end?: string;
  /** The field the timeline splits into bands, as on a board. */
  groupBy?: string;
  /** The zoom levels people can switch between, in order; the first opens. Default `['week', 'month', 'day']`. */
  scales?: TimelineScale[];
  /** The date field each bar starts on. */
  start: string;
  type: 'timeline';
};

export type CustomView = ViewConfig & {
  component: FrogBotComponent;
  components?: ViewComponents;
  shell?: boolean;
  type: 'custom';
};

export type CollectionView =
  BoardView | CalendarView | CustomView | GalleryView | ListView | TimelineView;

export type CollectionViewMetadata = Omit<
  CollectionView,
  'access' | 'component' | 'components' | 'filter' | 'icon'
> & {
  label: string;
  path: string;
  slug: string;
};

export type InitPageResult = Omit<Payload.InitPageResult, 'globalConfig' | 'req'> & {
  req: FrogBotRequest;
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
  readonly req: FrogBotRequest;
};

export type DocumentTabServerProps = Payload.DocumentTabClientProps & DocumentTabServerPropsOnly;

export type DocumentTabCondition = (
  args: Omit<Parameters<Payload.DocumentTabCondition>[0], 'globalConfig' | 'req'> & {
    req: FrogBotRequest;
  },
) => boolean;

export type DocumentTabConfig = Omit<Payload.DocumentTabConfig, 'condition'> & {
  readonly condition?: DocumentTabCondition;
};

export type RootComponentServerProps = WithoutPayload<Payload.ServerProps> & {
  readonly req?: FrogBotRequest;
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
  TCellData = Payload.Document,
> = Omit<Payload.DefaultServerCellComponentProps<TField, TCellData>, 'payload'>;

export type WidgetWidth = Payload.WidgetWidth;

type TypedWidget = FrogBotTypes['widgets'];

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
  Component: FrogBotComponent;
  fields?: Field[];
  label?: Payload.Widget['label'];
  maxWidth?: WidgetWidth;
  minWidth?: WidgetWidth;
  slug: string;
};

export type DashboardConfig = {
  defaultLayout?:
    | ((args: { req: FrogBotRequest }) => Array<WidgetInstance> | Promise<Array<WidgetInstance>>)
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
    req: FrogBotRequest;
  };

export type {
  AdminViewClientProps,
  AfterListClientProps,
  AfterListTableClientProps,
  BeforeDocumentControlsClientProps,
  BeforeListClientProps,
  BeforeListTableClientProps,
  DocumentSubViewTypes,
  DocumentTabClientProps,
  DocumentViewClientProps,
  EditMenuItemsClientProps,
  EditViewProps,
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
