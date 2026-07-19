import type { Embedding } from 'ai';

export type EmbeddingsOpenAIResponse = {
  object: 'list';
  data: Array<{
    object: 'embedding';
    embedding: number[] | string;
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
};

export function toOpenAIEmbeddingsResponse(args: {
  embeddings: Embedding[];
  model: string;
  promptTokens?: number;
  encodingFormat?: 'float' | 'base64' | null;
}): EmbeddingsOpenAIResponse {
  const promptTokens = args.promptTokens ?? 0;
  return {
    object: 'list',
    data: args.embeddings.map((embedding, index) => ({
      object: 'embedding',
      embedding: args.encodingFormat === 'base64' ? encodeEmbedding(embedding) : embedding,
      index,
    })),
    model: args.model,
    usage: {
      prompt_tokens: promptTokens,
      total_tokens: promptTokens,
    },
  };
}

export function encodeEmbedding(embedding: Embedding): string {
  const buffer = new ArrayBuffer(embedding.length * 4);
  const view = new DataView(buffer);
  embedding.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return bytesToBase64(new Uint8Array(buffer));
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
