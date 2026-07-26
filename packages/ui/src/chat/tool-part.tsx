import { getToolName, type DynamicToolUIPart, type ToolUIPart, type UITools } from 'ai'
import { useChatProvider } from './provider'
import { resolveToolRenderer } from './tool-registry'
import type { ToolRenderer } from './tool-registry'

function serialize(value: unknown) {
  if (typeof value === 'string') return value
  try { return JSON.stringify(value, null, 2) } catch { return String(value) }
}

export function ToolPart({ part, renderers }: { part: DynamicToolUIPart | ToolUIPart<UITools>; renderers?: readonly ToolRenderer[] }) {
  const provider = useChatProvider()
  const renderer = resolveToolRenderer(renderers ?? provider?.toolRenderers ?? [], getToolName(part))
  if (renderer) return <renderer.render part={part} />
  const content = part.state === 'output-available' ? part.output : part.state === 'output-error' ? part.errorText : part.state === 'output-denied' ? part.approval.reason || 'Denied' : part.input
  return <div data-part="tool" data-state={part.state} className="rounded-lg border border-border p-3 text-sm">
    <div className="flex justify-between gap-3"><strong>{getToolName(part)}</strong><span className="text-xs text-muted-foreground">{part.state}</span></div>
    {content !== undefined && <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">{serialize(content)}</pre>}
  </div>
}
