// The FrogBot ↔ Payload config seam. Before sanitization a FrogBot config is
// a Payload config whose reshaped keys (collections, hooks, access, …) take
// `FrogBotRequest`; sanitization adapts those keys. A Payload plugin reads
// and returns the shared keys, and FrogBot sanitizes whatever it adds, so
// handing the config across is a type change only. The checks pin the
// keys FrogBot does not reshape to Payload's types, both ways.

import { flattenTopLevelFields as flattenPayloadFields } from 'payload/shared';

import type { COLLECTION_MARKERS, CollectionConfig } from '../collections/config/types.js';
import type { FrogBotConfig } from '../config/types.js';
import type { Field, TabAsField } from '../fields/config/types.js';
import type { JobsConfig } from '../jobs/types.js';
import type { Plugin } from '../plugin.js';
import type { PayloadCollectionConfig, PayloadConfig, PayloadField } from '../types/payload.js';
import type { Check, Extends, Mutual } from './check.js';

type PayloadPlugin = NonNullable<PayloadConfig['plugins']>[number];

type ReshapedConfigKeys =
  | 'admin'
  | 'blocks'
  | 'collections'
  | 'db'
  | 'email'
  | 'endpoints'
  | 'hooks'
  | 'jobs'
  | 'localization'
  | 'onInit'
  | 'plugins';

type ReshapedCollectionKeys =
  'access' | 'admin' | 'auth' | 'endpoints' | 'fields' | 'hooks' | 'upload';

type ReshapedJobsKeys = 'workflows';

type ReshapedFieldKeys =
  | 'access'
  | 'blockReferences'
  | 'blocks'
  | 'fields'
  | 'filterOptions'
  | 'hooks'
  | 'tabs'
  | 'validate';

type FlattenedPayloadField = ReturnType<typeof flattenPayloadFields<PayloadField>>[number];

type Shared<TFrogBot, TPayload, TReshaped> = Mutual<
  Pick<TFrogBot, Exclude<Extract<keyof TFrogBot, keyof TPayload>, TReshaped>>,
  Pick<TPayload, Exclude<Extract<keyof TFrogBot, keyof TPayload>, TReshaped>>
>;

export type _ConfigChecks = [
  Check<Shared<FrogBotConfig, PayloadConfig, ReshapedConfigKeys>>,
  Check<Shared<CollectionConfig, PayloadCollectionConfig, ReshapedCollectionKeys>>,
  Check<Shared<JobsConfig, NonNullable<PayloadConfig['jobs']>, ReshapedJobsKeys>>,
  Check<Mutual<Exclude<Field['type'], 'vector'>, PayloadField['type']>>,
  Check<
    {
      [T in PayloadField['type']]: Shared<
        Extract<Field, { type: T }>,
        Extract<PayloadField, { type: T }>,
        ReshapedFieldKeys
      >;
    }[PayloadField['type']]
  >,
  Check<Extends<FlattenedPayloadField['type'], Field['type'] | TabAsField['type']>>,
];

export function toPayloadConfig(config: FrogBotConfig): PayloadConfig {
  return config as unknown as PayloadConfig;
}

export function fromPayloadConfig(config: PayloadConfig): FrogBotConfig {
  return config as unknown as FrogBotConfig;
}

type FrogBotCollectionKeys = (typeof COLLECTION_MARKERS)[number] | 'search';

export function toPayloadCollectionConfig(
  collection: Omit<CollectionConfig, FrogBotCollectionKeys>,
): PayloadCollectionConfig {
  return collection as unknown as PayloadCollectionConfig;
}

/** Vector fields stay `type: 'vector'` until sanitization lowers them to JSON fields. */
export function toPayloadFields(fields: readonly Field[]): PayloadField[] {
  return fields as unknown as PayloadField[];
}

export function fromPayloadFields(fields: readonly PayloadField[]): Field[] {
  return fields as unknown as Field[];
}

export function toPayloadField<TField extends Field>(
  field: TField,
): Extract<PayloadField, { type: TField['type'] }> {
  return field as unknown as Extract<PayloadField, { type: TField['type'] }>;
}

export function fromPayloadField(field: PayloadField): Field {
  return field as unknown as Field;
}

/** Payload's `flattenTopLevelFields` for FrogBot fields; named tabs come back as `type: 'tab'`. */
export function flattenTopLevelFields(fields: readonly Field[]): Array<Field | TabAsField> {
  return flattenPayloadFields(toPayloadFields(fields)) as unknown as Array<Field | TabAsField>;
}

export function wrapPayloadPlugin(plugin: PayloadPlugin): Plugin {
  return (config) => {
    const result = plugin(toPayloadConfig(config));

    return result instanceof Promise ? result.then(fromPayloadConfig) : fromPayloadConfig(result);
  };
}
