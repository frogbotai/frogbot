import { describe, expect, it } from "vitest";

import overlays from "../../../../scripts/fixtures/model-catalog-overlays.json" with { type: "json" };
import source from "../../../../scripts/fixtures/models-dev.json" with { type: "json" };

async function loadSync() {
  return import("../../../../scripts/sync-catalog.mjs");
}

describe("model catalog sync", () => {
  it("maps provider names and ignores unsupported providers", async () => {
    const { buildCatalogs } = await loadSync();
    const { catalog } = buildCatalogs({ overlays, source });

    expect(catalog.map(({ id }) => id)).toEqual([
      "anthropic/claude-current",
      "fireworks/zeta",
      "voyage/voyage-fixture",
    ]);
  });

  it("excludes deprecated models and applies overlays", async () => {
    const { buildCatalogs } = await loadSync();
    const { catalog } = buildCatalogs({ overlays, source });

    expect(catalog).not.toContainEqual(
      expect.objectContaining({ id: "anthropic/claude-retired" }),
    );
    expect(catalog).toContainEqual({
      id: "voyage/voyage-fixture",
      mode: "embedding",
      provider: "voyage",
    });
  });

  it("maps models.dev metadata to the gateway catalog shape", async () => {
    const { buildCatalogs } = await loadSync();
    const { gateway } = buildCatalogs({ overlays, source });

    expect(gateway[0]).toEqual({
      id: "anthropic/claude-current",
      name: "Claude Current",
      created: "2026-01-02",
      knowledge: "2025-12-01",
      modalities: { input: ["text", "image"], output: ["text"] },
      operations: ["chat.completions"],
      capabilities: {
        promptCaching: true,
        reasoning: true,
        streaming: true,
        structuredOutput: true,
        toolCalling: true,
        vision: true,
      },
      context: { input: 200000, output: 64000 },
      cost: { input: 3, output: 15, cache_read: 0.1, cache_write: 3.75 },
      providers: ["anthropic"],
    });
  });

  it("renders deterministic committed artifacts", async () => {
    const { buildCatalogs, renderCatalog, renderGatewayCatalog } =
      await loadSync();
    const first = buildCatalogs({ overlays, source });
    const second = buildCatalogs({ overlays: [...overlays].reverse(), source });

    expect(renderCatalog(first.catalog)).toBe(renderCatalog(second.catalog));
    expect(renderGatewayCatalog(first.gateway)).toBe(
      renderGatewayCatalog(second.gateway),
    );
  });
});
