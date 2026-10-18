import type { SelectFn, SelectIncludeType, SelectType } from 'payload';
import { getSelectMode } from 'payload/shared';

import { flattenTopLevelFields } from '../../../seams/config.js';
import type { Field } from '../../config/types.js';
import { getAIKind } from './hooks.js';
import { aiFieldPaths } from './state.js';

/**
 * Selects each selected AI field's status, error and inputs with it, so list cells keep their
 * state and can offer Generate.
 */
export function withAIFieldSelect(fields: Field[], select?: SelectFn): SelectFn | undefined {
  const kinds = flattenTopLevelFields(fields).flatMap((field) => {
    const kind = field.type !== 'tab' ? getAIKind(field) : undefined;

    return kind && 'name' in field && typeof field.name === 'string'
      ? [{ name: field.name, inputs: kind.inputs }]
      : [];
  });

  if (!kinds.length) return select;

  return (args) => {
    const chosen: SelectType | undefined = select?.(args) ?? args.select;

    if (!chosen || getSelectMode(chosen) !== 'include') return chosen;

    const include = chosen as SelectIncludeType;

    const siblings = kinds
      .filter(({ name }) => include[name])
      .flatMap(({ name, inputs }) => [...Object.values(aiFieldPaths(name)), ...inputs]);

    return siblings.length
      ? { ...include, ...Object.fromEntries(siblings.map((path) => [path, true as const])) }
      : chosen;
  };
}
