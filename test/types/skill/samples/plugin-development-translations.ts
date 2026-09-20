import type { Plugin } from 'frogbot';

export const pluginTranslations = {
  en: {
    'plugin-notes': {
      addNote: 'Add note',
      empty: 'No notes yet',
    },
  },
  es: {
    'plugin-notes': {
      addNote: 'Agregar nota',
      empty: 'Todavía no hay notas',
    },
  },
};

export const notesTranslationsPlugin: Plugin = (config) => {
  const translations = { ...config.i18n?.translations };
  const locales: (keyof typeof pluginTranslations)[] = ['en', 'es'];

  for (const locale of locales) {
    const existing = translations[locale];
    const namespace = existing && 'plugin-notes' in existing ? existing['plugin-notes'] : undefined;

    translations[locale] = {
      ...existing,
      'plugin-notes': {
        ...pluginTranslations[locale]['plugin-notes'],
        ...(typeof namespace === 'object' && namespace !== null ? namespace : {}),
      },
    };
  }

  return {
    ...config,
    i18n: {
      ...config.i18n,
      translations,
    },
  };
};
