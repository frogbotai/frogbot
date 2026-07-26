import type { DynamicToolUIPart, ToolUIPart, UITools } from 'ai'
import type { ComponentType } from 'react'

export type ToolPartValue = DynamicToolUIPart | ToolUIPart<UITools>

export interface ToolRendererProps {
  part: ToolPartValue
}

export interface ToolRenderer {
  kind: string
  render: ComponentType<ToolRendererProps>
}

export function resolveToolRenderer(renderers: readonly ToolRenderer[], kind: string): ToolRenderer | undefined {
  return renderers.find((renderer) => renderer.kind === kind)
}
