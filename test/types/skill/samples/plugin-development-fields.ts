import type { Field, Plugin } from 'frogbot';

type NotesFieldsOptions = {
  collections: string[];
  fields?: (args: { defaultFields: Field[] }) => Field[];
};

export function notesFieldsPlugin(options: NotesFieldsOptions): Plugin {
  return (config) => {
    const defaultFields: Field[] = [{ name: 'internalNotes', type: 'textarea' }];
    const fields = options.fields?.({ defaultFields }) ?? defaultFields;

    return {
      ...config,
      collections: config.collections.map((collection) => {
        if (!options.collections.includes(collection.slug)) {
          return collection;
        }

        const existingNames = new Set(
          collection.fields.flatMap((field) => ('name' in field ? [field.name] : [])),
        );

        const collision = fields.find((field) => 'name' in field && existingNames.has(field.name));

        if (collision && 'name' in collision) {
          throw new Error(
            `[plugin-notes] Field '${collision.name}' already exists on '${collection.slug}'.`,
          );
        }

        return {
          ...collection,
          fields: [...collection.fields, ...fields],
        };
      }),
    };
  };
}
