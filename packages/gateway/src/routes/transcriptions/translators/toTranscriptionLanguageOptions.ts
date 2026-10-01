import type { JSONValue } from 'ai';

export type ToTranscriptionLanguageOptionsArgs = {
  providerName: string;
  language: string;
};

export function toTranscriptionLanguageOptions(
  args: ToTranscriptionLanguageOptionsArgs,
): Record<string, JSONValue> {
  const { providerName, language } = args;

  if (providerName === 'assemblyai' || providerName === 'elevenlabs') {
    return { languageCode: language };
  }

  if (providerName === 'google' || providerName === 'vertex') return { languageCodes: [language] };

  return { language };
}
