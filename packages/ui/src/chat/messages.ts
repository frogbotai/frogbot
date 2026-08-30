import type { UIMessage } from 'ai';

export type MessageDocument = {
  id: string | number;
  role: UIMessage['role'];
  parts: UIMessage['parts'];
  metadata?: unknown;
  createdAt?: string;
};

function withCreatedAt(message: MessageDocument): unknown {
  if (!message.createdAt) return message.metadata;
  return typeof message.metadata === 'object' && message.metadata !== null
    ? { ...message.metadata, createdAt: message.createdAt }
    : { createdAt: message.createdAt };
}

export function messageDocumentToUIMessage(message: MessageDocument): UIMessage {
  const metadata = withCreatedAt(message);
  return {
    id: String(message.id),
    role: message.role,
    parts: message.parts,
    ...(metadata == null ? {} : { metadata }),
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
