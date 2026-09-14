import { mondayAuth } from './config.js';

const apiUrl = 'https://api.monday.com/v2';

type GraphQLResponse<T> = { data?: T; errors?: Array<{ message?: string }> };

export class MondayClient {
  readonly apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  async query<T>(query: string, variables: Record<string, unknown>, signal?: AbortSignal) {
    signal?.throwIfAborted();

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'API-Version': '2023-10',
        Authorization: this.apiToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal,
      redirect: 'error',
    });
    const result = (await response.json()) as GraphQLResponse<T>;

    if (!response.ok || result.errors?.length || !result.data) {
      const message = result.errors
        ?.map((error) => error.message)
        .filter(Boolean)
        .join('; ');

      throw new Error(message || `Monday API request failed with status ${response.status}.`);
    }

    return result.data;
  }

  async upload(
    input: { itemId: string; columnId: string; fileName: string; base64: string },
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();

    const form = new FormData();
    form.append(
      'query',
      'mutation($itemId: ID!, $columnId: String!, $file: File!) { add_file_to_column(item_id: $itemId, column_id: $columnId, file: $file) { id url name file_size file_extension created_at } }',
    );
    form.append('variables', JSON.stringify({ itemId: input.itemId, columnId: input.columnId }));
    form.append('map', JSON.stringify({ file: 'variables.file' }));
    form.append('file', new Blob([Buffer.from(input.base64, 'base64')]), input.fileName);

    const response = await fetch(`${apiUrl}/file`, {
      method: 'POST',
      headers: { 'API-Version': '2024-01', Authorization: this.apiToken },
      body: form,
      signal,
      redirect: 'error',
    });
    const result = (await response.json()) as GraphQLResponse<{
      add_file_to_column: Record<string, unknown>;
    }>;

    if (!response.ok || result.errors?.length || !result.data) {
      const message = result.errors
        ?.map((error) => error.message)
        .filter(Boolean)
        .join('; ');

      throw new Error(message || `Monday file upload failed with status ${response.status}.`);
    }

    return result.data.add_file_to_column;
  }
}

export type Monday = MondayClient;

export function createMondayClient({ auth }: { auth: unknown }) {
  return new MondayClient(mondayAuth.parse(auth).apiToken);
}
