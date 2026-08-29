import type { ReactNode } from 'react';

import { ArtifactStreamPart } from './artifact';

export interface DataPartValue {
  data: unknown;
  id?: string;
  type: `data-${string}`;
}

export function DataPart({
  part,
  render,
}: {
  part: DataPartValue;
  render?: (part: DataPartValue) => ReactNode;
}) {
  if (render) {
    return (
      <>
        <ArtifactStreamPart part={part} />
        {render(part)}
      </>
    );
  }
  let content: string;
  try {
    content = JSON.stringify(part.data, null, 2);
  } catch {
    content = String(part.data);
  }
  return (
    <>
      <ArtifactStreamPart part={part} />
      <pre data-part="data" data-data-type={part.type.slice(5)} className="fb-data-part">
        {content}
      </pre>
    </>
  );
}
