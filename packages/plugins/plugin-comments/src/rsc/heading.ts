type SchemaEntry = {
  admin?: { hidden?: boolean };
  fields?: SchemaEntry[];
  hidden?: boolean;
  type?: string;
};

/** The server props a field component gets that say where it sits. */
export type PlacementProps = {
  fieldSchemaMap?: Map<string, unknown>;
  schemaPath?: string;
};

/** Whether the field is the only visible field in a tab, so the tab's label already names it. */
export function soleInTab({ fieldSchemaMap, schemaPath }: PlacementProps): boolean {
  if (!fieldSchemaMap || !schemaPath?.includes('.')) return false;

  const parent = fieldSchemaMap.get(schemaPath.slice(0, schemaPath.lastIndexOf('.'))) as
    SchemaEntry | undefined;

  if (parent?.type !== 'tab' || !parent.fields) return false;

  return parent.fields.filter((field) => !field.hidden && !field.admin?.hidden).length === 1;
}
