import type { FrogbotRequest } from 'frogbot';
import type { PieceActionDefinition } from 'frogbot/pieces';
import { z } from 'zod';

import type { Monday } from './client.js';
import { formatColumnValue, type MondayColumnValue, parseColumnValue } from './columns.js';

function action<TInput extends z.ZodType, TOutput extends z.ZodType>(
  definition: PieceActionDefinition<TInput, TOutput, Record<string, never>, Monday>,
) {
  return definition;
}

const id = z.string().min(1);
const workspaceId = id.meta({ label: 'Workspace' });
const boardId = id.meta({ label: 'Board' });
const itemId = id.meta({ label: 'Item' });
const columnValues = z.record(z.string(), z.unknown()).meta({ label: 'Column Values' });
const objectOutput = z.record(z.string(), z.unknown());
const writableTypes = new Set([
  'board_relation',
  'checkbox',
  'country',
  'date',
  'dependency',
  'dropdown',
  'email',
  'hour',
  'link',
  'location',
  'long_text',
  'numbers',
  'people',
  'phone',
  'rating',
  'status',
  'text',
  'timeline',
  'week',
  'world_clock',
]);

async function query<T>(client: Monday, req: FrogbotRequest, document: string, variables = {}) {
  return client.query<T>(document, variables, req.signal ?? undefined);
}

export async function workspaces({ client, req }: { client: Monday; req: FrogbotRequest }) {
  const data = await query<{ workspaces: Array<{ id: string; name: string }> }>(
    client,
    req,
    'query { workspaces(limit: 100) { id name } }',
  );

  return data.workspaces.map((workspace) => ({ label: workspace.name, value: workspace.id }));
}

export async function boards({
  input,
  client,
  req,
}: {
  input: { workspaceId?: string };
  client: Monday;
  req: FrogbotRequest;
}) {
  if (!input.workspaceId) return [];

  const data = await query<{ boards: Array<{ id: string; name: string; type: string }> }>(
    client,
    req,
    'query($workspaceId: ID!) { boards(workspace_ids: [$workspaceId], order_by: created_at) { id name type } }',
    { workspaceId: input.workspaceId },
  );

  return data.boards
    .filter((board) => board.type === 'board')
    .map((board) => ({ label: board.name, value: board.id }));
}

async function boardDetails(client: Monday, req: FrogbotRequest, board: string) {
  const data = await query<{
    boards: Array<{
      groups: Array<{ id: string; title: string }>;
      columns: Array<{ id: string; title: string; type: string }>;
      items_page: { items: Array<{ id: string; name: string }> };
    }>;
  }>(
    client,
    req,
    'query($boardId: ID!) { boards(ids: [$boardId]) { groups { id title } columns { id title type } items_page { items { id name } } } }',
    { boardId: board },
  );

  return data.boards[0];
}

export function boardOptions(
  select: 'groups' | 'items' | 'columns',
  filter?: (type: string) => boolean,
) {
  return async ({
    input,
    client,
    req,
  }: {
    input: { boardId?: string };
    client: Monday;
    req: FrogbotRequest;
  }) => {
    if (!input.boardId) return [];

    const board = await boardDetails(client, req, input.boardId);
    if (!board) return [];

    if (select === 'groups') {
      return board.groups.map((group) => ({ label: group.title, value: group.id }));
    }
    if (select === 'items') {
      return board.items_page.items.map((item) => ({ label: item.name, value: item.id }));
    }

    return board.columns
      .filter((column) => !filter || filter(column.type))
      .map((column) => ({ label: column.title, value: column.id }));
  };
}

const commonOptions = { workspaceId: workspaces, boardId: boards };
const groupOptions = boardOptions('groups');
const itemOptions = boardOptions('items');
const columnOptions = boardOptions('columns');

async function encodedColumnValues(
  client: Monday,
  req: FrogbotRequest,
  board: string,
  values: Record<string, unknown>,
) {
  const details = await boardDetails(client, req, board);
  const types = new Map(details?.columns.map((column) => [column.id, column.type]) ?? []);
  const result: Record<string, unknown> = {};

  for (const [column, value] of Object.entries(values)) {
    if (value !== '' && value !== undefined && writableTypes.has(types.get(column) ?? '')) {
      result[column] = formatColumnValue(types.get(column)!, value);
    }
  }

  return JSON.stringify(result);
}

const itemFields =
  'id name column_values { id type value text ... on ButtonValue { label } ... on StatusValue { label } ... on VoteValue { vote_count } ... on TagsValue { tags { name } } ... on BoardRelationValue { linked_item_ids } ... on DependencyValue { linked_item_ids } ... on WeekValue { start_date end_date } }';

function parseItem(item: { id: string; name: string; column_values: MondayColumnValue[] }) {
  const result: Record<string, unknown> = { id: item.id, name: item.name };

  for (const column of item.column_values) result[column.id] = parseColumnValue(column);

  return result;
}

export const createColumn = action({
  slug: 'createColumn',
  description: 'Create a column on a board.',
  input: z.object({ workspaceId, boardId, title: z.string().min(1), type: z.string().min(1) }),
  output: objectOutput,
  options: commonOptions,
  async run({ input, client, req }) {
    const data = await query<{ create_column: Record<string, unknown> }>(
      client,
      req,
      'mutation($boardId: ID!, $title: String!, $type: ColumnType!) { create_column(board_id: $boardId, title: $title, column_type: $type) { id } }',
      input,
    );

    return data.create_column;
  },
});

export const createGroup = action({
  slug: 'createGroup',
  description: 'Create a group on a board.',
  input: z.object({ workspaceId, boardId, name: z.string().min(1) }),
  output: objectOutput,
  options: commonOptions,
  async run({ input, client, req }) {
    const data = await query<{ create_group: Record<string, unknown> }>(
      client,
      req,
      'mutation($boardId: ID!, $name: String!) { create_group(board_id: $boardId, group_name: $name) { id } }',
      input,
    );

    return data.create_group;
  },
});

export const createItem = action({
  slug: 'createItem',
  description: 'Create an item on a board.',
  input: z.object({
    workspaceId,
    boardId,
    groupId: id.optional(),
    name: z.string().min(1),
    columnValues,
    createLabelsIfMissing: z.boolean().default(false),
  }),
  output: objectOutput,
  options: { ...commonOptions, groupId: groupOptions, columnValues: columnOptions },
  async run({ input, client, req }) {
    const values = await encodedColumnValues(client, req, input.boardId, input.columnValues);
    const data = await query<{ create_item: Record<string, unknown> }>(
      client,
      req,
      'mutation($name: String!, $boardId: ID!, $groupId: String, $columnValues: JSON, $createLabelsIfMissing: Boolean) { create_item(item_name: $name, board_id: $boardId, group_id: $groupId, column_values: $columnValues, create_labels_if_missing: $createLabelsIfMissing) { id } }',
      { ...input, columnValues: values },
    );

    return data.create_item;
  },
});

export const createUpdate = action({
  slug: 'createUpdate',
  description: 'Create an update on an item.',
  input: z.object({ itemId, body: z.string().min(1) }),
  output: objectOutput,
  async run({ input, client, req }) {
    const data = await query<{ create_update: Record<string, unknown> }>(
      client,
      req,
      'mutation($itemId: ID!, $body: String!) { create_update(item_id: $itemId, body: $body) { id } }',
      input,
    );

    return data.create_update;
  },
});

export const listBoardItems = action({
  slug: 'listBoardItems',
  description: 'List a board’s items and column values.',
  input: z.object({ workspaceId, boardId, columnIds: z.array(id).optional() }),
  output: z.array(objectOutput),
  options: { ...commonOptions, columnIds: columnOptions },
  async run({ input, client, req }) {
    const fields = itemFields.replace('column_values {', 'column_values(ids: $columnIds) {');
    const data = await query<{
      boards: Array<{
        items_page: {
          items: Array<{ id: string; name: string; column_values: MondayColumnValue[] }>;
        };
      }>;
    }>(
      client,
      req,
      `query($boardId: ID!, $columnIds: [String!]) { boards(ids: [$boardId]) { items_page(query_params: { order_by: { column_id: "__last_updated__", direction: desc } }) { items { ${fields} } } } }`,
      input,
    );

    return (data.boards[0]?.items_page.items ?? []).map(parseItem);
  },
});

export const getItemColumnValues = action({
  slug: 'getItemColumnValues',
  description: 'Get one item’s column values.',
  input: z.object({ workspaceId, boardId, itemId, columnIds: z.array(id).optional() }),
  output: objectOutput,
  options: { ...commonOptions, itemId: itemOptions, columnIds: columnOptions },
  async run({ input, client, req }) {
    const fields = itemFields.replace('column_values {', 'column_values(ids: $columnIds) {');
    const data = await query<{
      boards: Array<{
        items_page: {
          items: Array<{ id: string; name: string; column_values: MondayColumnValue[] }>;
        };
      }>;
    }>(
      client,
      req,
      `query($boardId: ID!, $itemId: ID!, $columnIds: [String!]) { boards(ids: [$boardId]) { items_page(query_params: { ids: [$itemId] }) { items { ${fields} } } } }`,
      input,
    );
    const item = data.boards[0]?.items_page.items[0];

    if (!item) throw new Error(`Monday item '${input.itemId}' was not found.`);

    return parseItem(item);
  },
});

export const updateItemColumnValues = action({
  slug: 'updateItemColumnValues',
  description: 'Update multiple column values on an item.',
  input: z.object({ workspaceId, boardId, itemId, columnValues }),
  output: objectOutput,
  options: { ...commonOptions, itemId: itemOptions, columnValues: columnOptions },
  async run({ input, client, req }) {
    const values = await encodedColumnValues(client, req, input.boardId, input.columnValues);
    const data = await query<{ change_multiple_column_values: Record<string, unknown> }>(
      client,
      req,
      'mutation($itemId: ID!, $boardId: ID!, $columnValues: JSON!) { change_multiple_column_values(item_id: $itemId, board_id: $boardId, column_values: $columnValues) { id name } }',
      { ...input, columnValues: values },
    );

    return data.change_multiple_column_values;
  },
});

export const updateItemName = action({
  slug: 'updateItemName',
  description: 'Update an item’s name.',
  input: z.object({ workspaceId, boardId, itemId, name: z.string().min(1) }),
  output: objectOutput,
  options: { ...commonOptions, itemId: itemOptions },
  async run({ input, client, req }) {
    const data = await query<{ change_multiple_column_values: Record<string, unknown> }>(
      client,
      req,
      'mutation($itemId: ID!, $boardId: ID!, $columnValues: JSON!) { change_multiple_column_values(item_id: $itemId, board_id: $boardId, column_values: $columnValues) { id name } }',
      { ...input, columnValues: JSON.stringify({ name: input.name }) },
    );

    return data.change_multiple_column_values;
  },
});

export const uploadFileToColumn = action({
  slug: 'uploadFileToColumn',
  description: 'Upload a base64-encoded file to an item’s file column.',
  input: z.object({
    workspaceId,
    boardId,
    itemId,
    columnId: id,
    fileName: z.string().min(1),
    base64: z.base64(),
  }),
  output: objectOutput,
  options: {
    ...commonOptions,
    itemId: itemOptions,
    columnId: boardOptions('columns', (type) => type === 'file'),
  },
  async run({ input, client, req }) {
    return client.upload(input, req.signal ?? undefined);
  },
});

export const mondayActions = [
  createColumn,
  createGroup,
  createItem,
  createUpdate,
  listBoardItems,
  getItemColumnValues,
  updateItemColumnValues,
  updateItemName,
  uploadFileToColumn,
];
