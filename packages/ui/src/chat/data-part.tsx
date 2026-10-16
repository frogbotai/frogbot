import type { ComponentType, ReactNode } from 'react';

import { ArtifactStreamPart } from './artifact.js';
import { useChatProvider } from './provider.js';

export interface DataPartValue {
  data: unknown;
  id?: string;
  type: `data-${string}`;
}

export interface DataRenderer {
  kind: string;
  render: ComponentType<{ part: DataPartValue }>;
}

export function DataPartJson({ part }: { part: DataPartValue }) {
  let content: string;
  try {
    content = JSON.stringify(part.data, null, 2);
  } catch {
    content = String(part.data);
  }

  return (
    <pre data-part="data" data-data-type={part.type.slice(5)} className="fb-data-part">
      {content}
    </pre>
  );
}

export function DataPart({
  part,
  render,
}: {
  part: DataPartValue;
  render?: (part: DataPartValue) => ReactNode;
}) {
  const provider = useChatProvider();
  const kind = part.type.slice(5);
  const Renderer = render
    ? undefined
    : provider?.dataRenderers.find((renderer) => renderer.kind === kind)?.render;

  return (
    <>
      <ArtifactStreamPart part={part} />
      {render ? render(part) : Renderer ? <Renderer part={part} /> : <DataPartJson part={part} />}
    </>
  );
}
