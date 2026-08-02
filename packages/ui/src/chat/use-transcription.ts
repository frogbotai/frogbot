'use client'

import { useEffect, useRef, useState } from 'react'

export type TranscriptionStatus = 'idle' | 'recording' | 'transcribing'

const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

function recordingType() {
  return mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

function errorMessage(cause: unknown) {
  return typeof cause === 'object' && cause && 'message' in cause ? String(cause.message) : String(cause)
}

export function useTranscription({ onText, transcribe }: { transcribe: (file: File) => Promise<string>; onText: (text: string) => void }) {
  const [status, setStatus] = useState<TranscriptionStatus>('idle')
  const [error, setError] = useState<string>()
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const mounted = useRef(true)
  const canRecord = typeof MediaRecorder !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  const cleanup = () => {
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
    recorder.current = null
  }

  useEffect(() => () => {
    mounted.current = false
    if (recorder.current?.state === 'recording') recorder.current.stop()
    cleanup()
  }, [])

  const start = async () => {
    if (!canRecord || status !== 'idle') return
    setError(undefined)
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current) return cleanup()
      const mimeType = recordingType()
      const chunks: Blob[] = []
      const mediaRecorder = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined)
      recorder.current = mediaRecorder
      mediaRecorder.ondataavailable = ({ data }) => {
        if (data.size) chunks.push(data)
      }
      mediaRecorder.onstop = async () => {
        if (!mounted.current) return
        setStatus('transcribing')
        try {
          const type = mediaRecorder.mimeType || mimeType || 'audio/webm'
          const extension = type.includes('mp4') ? 'mp4' : 'webm'
          const text = (await transcribe(new File(chunks, `recording.${extension}`, { type }))).trim()
          if (!text) throw new Error('No speech detected')
          onText(text)
        } catch (cause) {
          setError(errorMessage(cause))
        } finally {
          cleanup()
          if (mounted.current) setStatus('idle')
        }
      }
      mediaRecorder.start()
      setStatus('recording')
    } catch (cause) {
      cleanup()
      setError(errorMessage(cause))
      setStatus('idle')
    }
  }

  const stop = () => {
    if (status === 'recording') recorder.current?.stop()
  }

  return { canRecord, error, start, status, stop }
}
