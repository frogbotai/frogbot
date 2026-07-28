import type { HookUsage } from "../hooks.js";
import { calculateCostUSD } from "./catalog.js";
import { DEFAULT_MODEL_CATALOG } from "./catalog.data.js";

export function calculateModelCostUSD(model: string, usage: HookUsage): number {
  return calculateCostUSD(usage, DEFAULT_MODEL_CATALOG.get(model)?.cost);
}
