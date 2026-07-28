import type { CollectionConfig } from "../types/collection.js";
import type { FrogbotConfig } from "../types/config.js";
import { mergeCollection } from "../collections/mergeCollection.js";
import { resolveUserSlug } from "../chat/resolveUserSlug.js";

export const USAGE_LOGS_SLUG = "usage-logs";

type UsageCollectionProps = {
  userSlug: string;
  threadsSlug?: string;
};

export function defaultUsageCollection({
  userSlug,
  threadsSlug,
}: UsageCollectionProps): CollectionConfig {
  return {
    slug: USAGE_LOGS_SLUG,
    admin: {
      group: "AI",
      defaultColumns: ["model", "operation", "user", "costUSD", "requestedAt"],
    },
    access: {
      create: () => false,
      read: () => false,
      update: () => false,
      delete: () => false,
    },
    fields: [
      { name: "user", type: "relationship", relationTo: userSlug, index: true },
      ...(threadsSlug
        ? [
            {
              name: "thread",
              type: "relationship" as const,
              relationTo: threadsSlug,
              index: true,
            },
          ]
        : []),
      { name: "requestId", type: "text", required: true, index: true },
      { name: "runId", type: "text", index: true },
      { name: "model", type: "text", required: true, index: true },
      {
        name: "operation",
        type: "select",
        required: true,
        options: [
          "chat.completions",
          "messages",
          "responses",
          "embeddings",
          "images",
          "speech",
          "transcriptions",
          "videos",
          "rerank",
        ],
      },
      { name: "inputTokens", type: "number", defaultValue: 0, required: true },
      { name: "outputTokens", type: "number", defaultValue: 0, required: true },
      { name: "cachedInputTokens", type: "number" },
      { name: "cacheWriteTokens", type: "number" },
      { name: "reasoningTokens", type: "number" },
      { name: "totalTokens", type: "number", defaultValue: 0, required: true },
      { name: "costUSD", type: "number", defaultValue: 0, required: true },
      { name: "finishReason", type: "text" },
      { name: "requestedAt", type: "date", required: true, index: true },
    ],
  };
}

export function resolveUsageCollection(
  config: FrogbotConfig,
  threadsSlug?: string,
): CollectionConfig[] {
  if (!config.ai) return config.collections;
  const base = defaultUsageCollection({
    userSlug: resolveUserSlug(config),
    threadsSlug,
  });
  const existing = config.collections.find(
    (collection) => collection.slug === USAGE_LOGS_SLUG,
  );
  if (!existing) return [...config.collections, base];
  const collections = [...config.collections];
  collections[collections.indexOf(existing)] = mergeCollection({
    user: existing,
    base,
    reservedFields: base.fields
      .map((field) => ("name" in field ? field.name : undefined))
      .filter((name): name is string => !!name),
    feature: "AI usage tracking",
  });
  return collections;
}
