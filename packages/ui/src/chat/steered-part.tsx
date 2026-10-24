import { DataPartJson, type DataPartValue } from './data-part.js';

export type SteeredPartData = {
  messageId: string;
  text: string;
};

function isSteeredPartData(data: unknown): data is SteeredPartData {
  if (typeof data !== 'object' || data === null) return false;

  const { messageId, text } = data as Record<string, unknown>;

  return typeof messageId === 'string' && typeof text === 'string';
}

/** A message the user steered into a running reply, shown where the reply took it. */
export function SteeredPart({ part }: { part: DataPartValue }) {
  if (!isSteeredPartData(part.data)) return <DataPartJson part={part} />;

  return (
    <div data-part="steered" className="fb-steered">
      <div className="fb-steered__bubble">{part.data.text}</div>
    </div>
  );
}
