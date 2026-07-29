import { describe, expect, it } from "vitest";

import type { FrogbotConfig } from "../types/config.js";
import { resolveUsageCollection, USAGE_LOGS_SLUG } from "./usageCollection.js";

function makeConfig(overrides: Partial<FrogbotConfig> = {}): FrogbotConfig {
  return {
    secret: "test",
    collections: [],
    ai: { providers: { openai: { apiKey: "test" } } },
    ...overrides,
  } as FrogbotConfig;
}

describe("resolveUsageCollection", () => {
  it("injects usage logs only when AI is configured", () => {
    expect(resolveUsageCollection(makeConfig()).collections.at(-1)?.slug).toBe(
      USAGE_LOGS_SLUG,
    );
    expect(resolveUsageCollection(makeConfig({ ai: undefined })).collections).toEqual([]);
  });

  it("adds an indexed thread relationship when chat is enabled", () => {
    const collection = resolveUsageCollection(makeConfig(), "threads").collections.at(-1);
    expect(collection?.fields).toContainEqual(
      expect.objectContaining({
        name: "thread",
        type: "relationship",
        relationTo: "threads",
        index: true,
      }),
    );
  });

  it("merges a marked collection while protecting reserved fields", () => {
    const config = makeConfig({
      collections: [
        {
          slug: "ai-usage",
          usageLog: true,
          fields: [{ name: "team", type: "text" }],
        },
      ],
    });
    const collection = resolveUsageCollection(config).collections.find(
      ({ slug }) => slug === "ai-usage",
    );
    expect(collection?.fields).toContainEqual(
      expect.objectContaining({ name: "team" }),
    );
    expect(collection?.fields).toContainEqual(
      expect.objectContaining({ name: "requestId", index: true }),
    );
  });

  it("resolves a marked custom collection slug", () => {
    const result = resolveUsageCollection(
      makeConfig({
        collections: [
          { slug: "ai-usage", usageLog: true, fields: [] },
        ],
      }),
    );
    expect(result.slug).toBe("ai-usage");
    expect(result.collections).toHaveLength(1);
  });

  it("preserves custom read access on a marked collection", () => {
    const read = () => false as const;
    const result = resolveUsageCollection(
      makeConfig({
        collections: [
          {
            slug: "ai-usage",
            usageLog: true,
            access: { read },
            fields: [],
          },
        ],
      }),
    );
    expect(result.collections[0]?.access?.read).toBe(read);
  });

  it("keeps unspecified write access denied", () => {
    const result = resolveUsageCollection(
      makeConfig({
        collections: [
          { slug: "ai-usage", usageLog: true, fields: [] },
        ],
      }),
    );
    const access = result.collections[0]?.access;
    expect(access?.create?.({ req: {} } as never)).toBe(false);
    expect(access?.update?.({ req: {} } as never)).toBe(false);
    expect(access?.delete?.({ req: {} } as never)).toBe(false);
  });

  it("rejects reserved fields on a marked collection", () => {
    expect(() =>
      resolveUsageCollection(
        makeConfig({
          collections: [
            {
              slug: "ai-usage",
              usageLog: true,
              fields: [{ name: "requestId", type: "text" }],
            },
          ],
        }),
      ),
    ).toThrow(
      "[frogbot] Field 'requestId' on collection 'ai-usage' is reserved by AI usage tracking.",
    );
  });

  it("rejects duplicate usage-log markers", () => {
    expect(() =>
      resolveUsageCollection(
        makeConfig({
          collections: [
            { slug: "a", usageLog: true, fields: [] },
            { slug: "b", usageLog: true, fields: [] },
          ],
        }),
      ),
    ).toThrow(
      "[frogbot] Multiple collections marked `usageLog: true` (a, b). Mark exactly one.",
    );
  });
});
