import { type DynamicToolUIPart, getToolName, type ToolUIPart, type UITools } from 'ai';

import { useChatProvider } from './provider';
import type { ToolRenderer } from './tool-registry';
import { resolveToolRenderer } from './tool-registry';

function serialize(value: unknown) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ToolPart({
  part,
  renderers,
}: {
  part: DynamicToolUIPart | ToolUIPart<UITools>;
  renderers?: readonly ToolRenderer[];
}) {
  const provider = useChatProvider();
  const renderer = resolveToolRenderer(
    renderers ?? provider?.toolRenderers ?? [],
    getToolName(part),
  );
  if (renderer) return <renderer.render part={part} />;
  const content =
    part.state === 'output-available'
      ? part.output
      : part.state === 'output-error'
        ? part.errorText
        : part.state === 'output-denied'
          ? part.approval.reason || 'Denied'
          : part.input;
  return (
    <div data-part="tool" data-state={part.state} className="fb-tool-part">
      <div className="fb-tool-part__header">
        <strong>{getToolName(part)}</strong>
        <span className="fb-tool-part__state">{part.state}</span>
      </div>
      {content !== undefined && <pre className="fb-tool-part__content">{serialize(content)}</pre>}
    </div>
  );
}
