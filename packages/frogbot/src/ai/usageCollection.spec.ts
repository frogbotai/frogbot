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
    expect(resolveUsageCollection(makeConfig()).at(-1)?.slug).toBe(
      USAGE_LOGS_SLUG,
    );
    expect(resolveUsageCollection(makeConfig({ ai: undefined }))).toEqual([]);
  });

  it("adds an indexed thread relationship when chat is enabled", () => {
    const collection = resolveUsageCollection(makeConfig(), "threads").at(-1);
    expect(collection?.fields).toContainEqual(
      expect.objectContaining({
        name: "thread",
        type: "relationship",
        relationTo: "threads",
        index: true,
      }),
    );
  });

  it("merges a user collection while protecting reserved fields", () => {
    const config = makeConfig({
      collections: [
        { slug: USAGE_LOGS_SLUG, fields: [{ name: "team", type: "text" }] },
      ],
    });
    const collection = resolveUsageCollection(config).at(-1);
    expect(collection?.fields).toContainEqual(
      expect.objectContaining({ name: "team" }),
    );
    expect(collection?.fields).toContainEqual(
      expect.objectContaining({ name: "requestId", index: true }),
    );
  });
});
