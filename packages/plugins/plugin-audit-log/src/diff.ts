const ignored = new Set(['createdAt', 'updatedAt']);

export type AuditChanges = Record<string, { old: unknown; new: unknown }>;

export function computeChanges(
  previousDoc: Record<string, unknown> | undefined,
  doc: Record<string, unknown>,
): AuditChanges {
  const changes: AuditChanges = {};
  const keys = new Set([...Object.keys(previousDoc ?? {}), ...Object.keys(doc)]);
  for (const key of keys) {
    if (ignored.has(key)) continue;
    const oldValue = previousDoc?.[key];
    const newValue = doc[key];
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[key] = {
        old: oldValue === undefined ? null : oldValue,
        new: newValue === undefined ? null : newValue,
      };
    }
  }
  return changes;
}
