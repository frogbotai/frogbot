import type { CollectionSlug, FrogbotInstance } from 'frogbot'

import { empty } from './scenarios/empty'
import { singleUser } from './scenarios/singleUser'
import { workspaceWithFiles } from './scenarios/workspaceWithFiles'

export type Scenario = 'empty' | 'singleUser' | 'workspaceWithFiles'

const scenarios = {
  empty,
  singleUser,
  workspaceWithFiles,
} as const

/**
 * Truncate every collection on the booted frogbot instance, then apply
 * the named seeding scenario. Call from `beforeEach` in int specs.
 *
 * Truncation order is `frogbot.collections` registration order;
 * relationships are not considered in v0 because only `empty` is
 * functional. Revisit when the first real scenario lands.
 */
export async function clearAndSeed(frogbot: FrogbotInstance, scenario: Scenario): Promise<void> {
  await clearAll(frogbot)
  await scenarios[scenario](frogbot)
}

async function clearAll(frogbot: FrogbotInstance): Promise<void> {
  for (const slug of Object.keys(frogbot.collections) as CollectionSlug[]) {
    await frogbot.delete({
      collection: slug,
      where: {},
      overrideAccess: true,
    })
  }
}
