import type { Sort, Where } from '../../types/payload.js';
import type { FrogbotRequest } from '../../types/request.js';
import type { FrogbotComponent } from '../types.js';

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

export type CustomView = ViewConfig & {
  component: FrogbotComponent;
  components?: ViewComponents;
  shell?: boolean;
  type: 'custom';
};

export type CollectionView = BoardView | CustomView | ListView;

export type CollectionViewMetadata = Omit<
  CollectionView,
  'access' | 'component' | 'components' | 'filter'
> & {
  label: string;
  path: string;
  slug: string;
};
