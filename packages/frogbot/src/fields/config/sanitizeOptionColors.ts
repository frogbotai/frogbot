import {
  type Field,
  type OptionObject,
  optionColors,
  type RadioField,
  type SelectField,
} from './types.js';

type SanitizeOptionColorsArgs = (
  { block?: undefined; collection: string } | { block: string; collection?: undefined }
) & {
  field: RadioField | SelectField;
  path: string;
};

const FIELD_CELL_PATH = '@frogbotai/next/client#FieldCell';

const knownColors = new Set<unknown>(optionColors);

export function sanitizeOptionColors({
  block,
  collection,
  field,
  path,
}: SanitizeOptionColorsArgs): Field {
  const colored = field.options.filter(
    (option): option is Required<OptionObject> =>
      typeof option === 'object' && option !== null && option.color !== undefined,
  );

  if (colored.length === 0) return field;

  const unknown = colored.find((option) => !knownColors.has(option.color));

  if (unknown) {
    const kind = field.type === 'radio' ? 'Radio' : 'Select';
    const owner = collection ? `collection '${collection}'` : `block '${block}'`;

    throw new Error(
      `[frogbot] ${kind} field '${path}' in ${owner}: option '${unknown.value}' has unknown color '${String(unknown.color)}'. Use one of: ${optionColors.join(', ')}.`,
    );
  }

  const colors = Object.fromEntries(colored.map((option) => [option.value, option.color]));

  const admin = field.admin ?? {};
  const custom = admin.custom ?? {};
  const frogbot = custom.frogbot;

  return {
    ...field,
    admin: {
      ...admin,
      components: { Cell: FIELD_CELL_PATH, ...admin.components },
      custom: {
        ...custom,
        frogbot: {
          ...(frogbot && typeof frogbot === 'object' ? frogbot : {}),
          optionColors: colors,
        },
      },
    },
  } as Field;
}
