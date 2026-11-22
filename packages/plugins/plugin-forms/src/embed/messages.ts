import type { FormConfirmation, FormDefinition } from '../types.js';

/** What the embed page hands its script: the form to render and where to send it. */
export type EmbedData = { definition: FormDefinition; submitUrl: string };

/** The messages an embedded form posts to the page that frames it. */
export type EmbedMessage =
  | { type: 'frogbot:form:height'; height: number }
  | { type: 'frogbot:form:submitted'; confirmation: FormConfirmation };
