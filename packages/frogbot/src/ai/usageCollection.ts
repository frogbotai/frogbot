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
      read: ({ req }) => Boolean(req.user),
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
): { collections: CollectionConfig[]; slug: string } {
  if (!config.ai) {
    return { collections: config.collections, slug: USAGE_LOGS_SLUG };
  }
  const marked = config.collections.filter(
    (collection) => collection.usageLog === true,
  );
  if (marked.length > 1) {
    throw new Error(
      `[frogbot] Multiple collections marked \`usageLog: true\` (${marked.map((collection) => collection.slug).join(", ")}). Mark exactly one.`,
    );
  }
  const existing = marked[0];
  const slug = existing?.slug ?? USAGE_LOGS_SLUG;
  const base = defaultUsageCollection({
    userSlug: resolveUserSlug(config),
    threadsSlug,
  });
  if (existing) {
    const collections = [...config.collections];
    collections[collections.indexOf(existing)] = mergeCollection({
      user: existing,
      base,
      reservedFields: base.fields
        .map((field) => ("name" in field ? field.name : undefined))
        .filter((name): name is string => !!name),
      feature: "AI usage tracking",
    });
    return { collections, slug };
  }
  if (config.collections.some((collection) => collection.slug === slug)) {
    throw new Error(
      `[frogbot] Collection slug '${slug}' conflicts with the default AI usage-log collection. Add \`usageLog: true\` to adopt it, or rename it.`,
    );
  }
  return { collections: [...config.collections, base], slug };
}
