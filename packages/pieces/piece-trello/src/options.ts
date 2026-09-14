import type { PieceOption } from 'frogbot/pieces';

import type { Trello } from './client.js';

export async function boardOptions({ client }: { client: Trello }): Promise<PieceOption[]> {
  return (await client.listBoards()).map(({ id, name }) => ({ label: name, value: id }));
}

export async function listOptions({
  client,
  input,
}: {
  client: Trello;
  input: { boardId?: string };
}): Promise<PieceOption[]> {
  if (!input.boardId) return [];

  return (await client.listLists(input.boardId)).map(({ id, name }) => ({
    label: name,
    value: id,
  }));
}

export async function labelOptions({
  client,
  input,
}: {
  client: Trello;
  input: { boardId?: string };
}): Promise<PieceOption[]> {
  if (!input.boardId) return [];

  return (await client.listLabels(input.boardId)).map(({ color, id, name }) => ({
    label: name || color,
    value: id,
  }));
}
