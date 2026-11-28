import { MissingEditorProp } from 'payload';

import { toFrogBotMessage } from '../errors/upstreamMessages.js';

/** The error to report when Payload's config build fails, worded for FrogBot. */
export function toBuildError(error: unknown): unknown {
  if (error instanceof MissingEditorProp) {
    return new Error(
      '[frogbot] A nested rich text field requires an explicit Lexical editor to avoid recursive defaults. Configure editor: lexicalEditor({}) on the nested field using @frogbotai/richtext-lexical.',
      { cause: error },
    );
  }

  if (error instanceof Error) error.message = toFrogBotMessage(error.message);

  return error;
}
