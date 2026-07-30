import { isDataUIPart, isFileUIPart, isReasoningFileUIPart, isReasoningUIPart, isTextUIPart, isToolUIPart, type UIDataTypes, type UIMessagePart, type UITools } from 'ai'
import type { ReactNode } from 'react'

import { DataPart, type DataPartValue } from './data-part'
import { FilePart } from './file-part'
import { ReasoningPart } from './reasoning-part'
import { SourcePart } from './source-part'
import { StepStartPart } from './step-start-part'
import { TextPart } from './text-part'
import { ToolPart } from './tool-part'

export type MessagePartValue = UIMessagePart<UIDataTypes, UITools> | ({ type: string } & Record<string, unknown>)

export interface MessagePartProps {
  fallback?: (part: MessagePartValue) => ReactNode
  part: MessagePartValue
  renderData?: (part: DataPartValue) => ReactNode
}

export function MessagePart({ fallback, part, renderData }: MessagePartProps) {
  const known = part as UIMessagePart<UIDataTypes, UITools>
  if (isTextUIPart(known)) return <TextPart part={known} />
  if (isReasoningUIPart(known)) return <ReasoningPart part={known} />
  if (isToolUIPart(known)) return <ToolPart part={known} />
  if (isDataUIPart(known)) return <DataPart part={known} render={renderData} />
  if (isFileUIPart(known) || isReasoningFileUIPart(known)) return <FilePart part={known} />
  if (known.type === 'source-url' || known.type === 'source-document') return <SourcePart part={known} />
  if (part.type === 'step-start') return <StepStartPart />
  return fallback ? fallback(part) : <div data-part="unknown">Unsupported message part: {part.type}</div>
}
