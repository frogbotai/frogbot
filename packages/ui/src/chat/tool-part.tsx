import { type DynamicToolUIPart, getToolName, type ToolUIPart, type UITools } from 'ai';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/collapsible.js';
import LoadingIcon from '../icons/icons/LoadingIcon.js';
import { useChatProvider } from './provider.js';
import { useToolActions } from './tool-actions.js';
import type { ToolRenderer } from './tool-registry.js';
import { resolveToolRenderer } from './tool-registry.js';

const SUMMARY_KEYS = ['description', 'query', 'url', 'path', 'pattern', 'name'];
const SUMMARY_FIELDS = 3;

function serialize(value: unknown) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function deniedReason(approval: { reason?: string } | undefined) {
  return approval?.reason || 'Denied';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): value is string | number | boolean {
  return (
    (typeof value === 'string' && value.trim() !== '') ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function summarize(input: unknown) {
  if (!isRecord(input)) return isPrimitive(input) ? String(input) : '';

  const lead = SUMMARY_KEYS.find((key) => {
    const value = input[key];

    return typeof value === 'string' && value.trim() !== '';
  });

  const fields = Object.entries(input)
    .filter(([key, value]) => key !== lead && isPrimitive(value))
    .slice(0, SUMMARY_FIELDS)
    .map(([key, value]) => `${key}=${String(value)}`);

  return [lead === undefined ? undefined : String(input[lead]), ...fields]
    .filter((value) => value !== undefined)
    .join(' ');
}

function ToolOutput({ name, output }: { name: string; output: unknown }) {
  if (!isRecord(output) || !Array.isArray(output.content)) {
    return <pre className="fb-tool-part__content">{serialize(output)}</pre>;
  }

  const { content, ...rest } = output;

  return (
    <>
      {(content as unknown[]).map((item, index) => {
        if (isRecord(item) && item.type === 'text' && typeof item.text === 'string') {
          return (
            <pre key={index} className="fb-tool-part__content">
              {item.text}
            </pre>
          );
        }

        if (
          isRecord(item) &&
          item.type === 'image' &&
          typeof item.data === 'string' &&
          typeof item.mimeType === 'string' &&
          item.mimeType.startsWith('image/')
        ) {
          return (
            <img
              key={index}
              className="fb-tool-part__image"
              src={`data:${item.mimeType};base64,${item.data}`}
              alt={`${name} result`}
            />
          );
        }

        return (
          <pre key={index} className="fb-tool-part__content">
            {serialize(item)}
          </pre>
        );
      })}
      {Object.keys(rest).length > 0 && (
        <pre className="fb-tool-part__content">{serialize(rest)}</pre>
      )}
    </>
  );
}

export function ToolPart({
  part,
  renderers,
}: {
  part: DynamicToolUIPart | ToolUIPart<UITools>;
  renderers?: readonly ToolRenderer[];
}) {
  const provider = useChatProvider();
  const actions = useToolActions();

  if (actions?.dockedToolCallIds?.has(part.toolCallId)) return null;

  const name = getToolName(part);
  const renderer = resolveToolRenderer(renderers ?? provider?.toolRenderers ?? [], name);

  if (renderer) {
    if (actions?.isReadonly) {
      return <renderer.render part={part} isReadonly channelLabel={actions.channelLabel} />;
    }

    if (!actions?.pendingToolCallIds.has(part.toolCallId)) return <renderer.render part={part} />;

    const { dismissToolCall } = actions;

    return (
      <renderer.render
        part={part}
        addToolOutput={(output) =>
          actions.addToolOutput({ tool: name, toolCallId: part.toolCallId, output })
        }
        dismiss={dismissToolCall ? () => dismissToolCall(part.toolCallId) : undefined}
      />
    );
  }

  const summary = summarize(part.input);

  return (
    <Collapsible data-part="tool" data-state={part.state} className="fb-tool-part">
      <CollapsibleTrigger className="fb-tool-part__header">
        <strong className="fb-tool-part__name">{name}</strong>
        {summary && <span className="fb-tool-part__summary">{summary}</span>}
        <span className="fb-tool-part__state">
          {part.state === 'input-streaming' || part.state === 'input-available' ? (
            <LoadingIcon className="fb-tool-part__spinner" aria-label="Running" />
          ) : part.state === 'output-error' ? (
            'Failed'
          ) : part.state === 'output-denied' ? (
            'Denied'
          ) : null}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="fb-tool-part__body">
        {part.input !== undefined && (
          <pre className="fb-tool-part__content">{serialize(part.input)}</pre>
        )}
        {part.state === 'output-available' ? (
          <ToolOutput name={name} output={part.output} />
        ) : part.state === 'output-error' ? (
          <pre className="fb-tool-part__content">{part.errorText}</pre>
        ) : part.state === 'output-denied' ? (
          <pre className="fb-tool-part__content">{deniedReason(part.approval)}</pre>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
