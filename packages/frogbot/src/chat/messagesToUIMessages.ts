import type { UIMessage } from 'ai';

import type { DocID } from '../types/operations.js';

export type PersistedMessage = {
  id: DocID;
  role: UIMessage['role'];
  parts: UIMessage['parts'];
  metadata?: unknown;
};

export function messagesToUIMessages(messages: PersistedMessage[]): UIMessage[] {
  return messages.map((message) => ({
    id: String(message.id),
    role: message.role,
    parts: message.parts,
    ...(message.metadata == null ? {} : { metadata: message.metadata }),
  }));
}
