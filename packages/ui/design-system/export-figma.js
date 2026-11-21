/* global figma */
const hex = ({ r, g, b, a }) =>
  `#${[r, g, b]
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}${
    a < 1
      ? Math.round(a * 255)
          .toString(16)
          .padStart(2, '0')
      : ''
  }`;

const collections = await figma.variables.getLocalVariableCollectionsAsync();
const variables = await figma.variables.getLocalVariablesAsync();
const byId = new Map(variables.map((variable) => [variable.id, variable]));

const read = (value) => {
  if (value?.type === 'VARIABLE_ALIAS') return { alias: byId.get(value.id).name };
  if (typeof value === 'object') return hex(value);

  return value;
};

const snapshot = { file: figma.fileKey, collections: {}, textStyles: {} };

for (const collection of collections) {
  const modes = Object.fromEntries(collection.modes.map((mode) => [mode.modeId, mode.name]));
  const entries = variables
    .filter((variable) => variable.variableCollectionId === collection.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
    .map((variable) => [
      variable.name,
      Object.fromEntries(
        Object.entries(variable.valuesByMode).map(([modeId, value]) => [
          modes[modeId],
          read(value),
        ]),
      ),
    ]);

  snapshot.collections[collection.name] = Object.fromEntries(entries);
}

for (const style of (await figma.getLocalTextStylesAsync()).sort((a, b) =>
  a.name.localeCompare(b.name),
)) {
  snapshot.textStyles[style.name] = {
    family: style.fontName.family,
    weight: style.fontName.style,
    size: style.fontSize,
    lineHeight: style.lineHeight.unit === 'PIXELS' ? style.lineHeight.value : style.lineHeight.unit,
  };
}

return snapshot;
