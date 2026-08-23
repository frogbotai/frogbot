import type { UIMessage } from 'ai';

export type MessageDocument = {
  id: string | number;
  role: UIMessage['role'];
  parts: UIMessage['parts'];
  metadata?: unknown;
};

export function messageDocumentToUIMessage(message: MessageDocument): UIMessage {
  return {
    id: String(message.id),
    role: message.role,
    parts: message.parts,
    ...(message.metadata == null ? {} : { metadata: message.metadata }),
  };
}

export function uiMessageToDocument(
  message: UIMessage,
  chat: string | number,
): MessageDocument & { chat: string | number } {
  return {
    id: String(message.id),
    chat,
    role: message.role,
    parts: message.parts,
    ...(message.metadata == null ? {} : { metadata: message.metadata }),
  };
}
