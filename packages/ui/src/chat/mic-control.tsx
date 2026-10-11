'use client';

import { useEffect } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/tooltip.js';
import MicIcon from '../icons/icons/MicIcon.js';
import { useChatProvider } from './provider.js';
import { useTranscription } from './use-transcription.js';

export function MicControl({
  onText,
  onWaveformChange,
}: {
  onText: (text: string) => void;
  onWaveformChange?: (audioData: Float32Array | null | undefined) => void;
}) {
  const provider = useChatProvider();
  const adapter = provider?.manifest?.transcribe ? provider.adapter : undefined;
  const transcription = useTranscription({
    onText,
    transcribe: async (file) => (await adapter?.transcribe?.(file)) ?? '',
  });

  useEffect(() => {
    onWaveformChange?.(transcription.status === 'recording' ? transcription.audioData : undefined);
  }, [onWaveformChange, transcription.audioData, transcription.status]);

  useEffect(() => () => onWaveformChange?.(undefined), [onWaveformChange]);
  if (!adapter?.transcribe || !transcription.canRecord) return null;
  const active = transcription.status === 'recording' || transcription.status === 'transcribing';

  return (
    <div className="fb-mic-control">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`fb-mic-control__indicator${active ? ' fb-mic-control__indicator--active animate-pulse' : ''}`}
            >
              <button
                type="button"
                aria-label="Use microphone"
                disabled={transcription.status === 'transcribing'}
                onClick={() =>
                  transcription.status === 'recording'
                    ? transcription.stop()
                    : void transcription.start()
                }
                className={`fb-mic-control__button${active ? ' fb-mic-control__button--active' : ''}`}
              >
                <MicIcon className="fb-mic-control__icon" />
              </button>
            </div>
          </TooltipTrigger>
          <TooltipContent align="center" side="top">
            Use microphone
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {transcription.error && (
        <span role="alert" className="fb-mic-control__error">
          {transcription.error}
        </span>
      )}
    </div>
  );
}
