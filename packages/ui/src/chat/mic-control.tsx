'use client'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/tooltip'
import MicIcon from '../icons/icons/MicIcon'
import { cn } from '../lib/utils'
import { useChatProvider } from './provider'
import { useTranscription } from './use-transcription'

export function MicControl({ onText }: { onText: (text: string) => void }) {
  const provider = useChatProvider()
  const capability = provider?.manifest?.ai?.transcribe
  const transcription = useTranscription({
    onText,
    transcribe: async (file) => capability ? (await provider.sdk.ai.transcribe({ file, model: capability.model })).text : '',
  })
  if (!capability || !transcription.canRecord) return null
  const active = transcription.status === 'recording' || transcription.status === 'transcribing'

  return <div className="flex flex-col items-end gap-1">
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('slide-up-1 flex items-center justify-center rounded-full', active && 'animate-pulse')} style={{ boxShadow: active ? '0px 0px 0px 4px var(--theme-base-500), 0px 0px 0px 12px var(--theme-base-600)' : undefined }}>
            <button type="button" aria-label="Use microphone" disabled={transcription.status === 'transcribing'} onClick={() => transcription.status === 'recording' ? transcription.stop() : void transcription.start()} className={cn('clear-button rounded-full p-1.5 text-base-700 hover:bg-base-300 hover:text-base-1000 active:bg-base-400 active:text-base-1000 disabled:cursor-wait sm:p-2', active && 'bg-base-300 text-brand-600')}>
              <MicIcon className="size-5 sm:size-6" />
            </button>
          </div>
        </TooltipTrigger>
        <TooltipContent align="center" side="top">Use microphone</TooltipContent>
      </Tooltip>
    </TooltipProvider>
    {transcription.error && <span role="alert" className="text-xs text-error">{transcription.error}</span>}
  </div>
}
