import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ChatPlatformAdapter } from './adapter'
import { MicControl } from './mic-control'
import { ChatProvider } from './provider'

class Recorder {
  static isTypeSupported = () => true
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  mimeType: string
  constructor(_: MediaStream, options?: MediaRecorderOptions) { this.mimeType = options?.mimeType ?? 'audio/webm' }
  start() {}
  stop() {
    this.ondataavailable?.({ data: new Blob(['voice'], { type: this.mimeType }) })
    this.onstop?.()
  }
}

const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream

describe('MicControl', () => {
  afterEach(() => vi.unstubAllGlobals())

  function adapter(transcribe: Response, capability: { model: string } | false = { model: 'whisper-1' }) {
    const fetch = vi.fn((input: RequestInfo | URL) => Promise.resolve(String(input).endsWith('/frogbot')
      ? Response.json({ ai: { transcribe: capability }, chat: { enabled: false }, files: { slug: 'files' }, agents: [] })
      : transcribe))
    return { fetch, adapter: { fetch } as ChatPlatformAdapter }
  }

  it('does not render without MediaRecorder', async () => {
    const value = adapter(Response.json({ text: 'hello' }))
    render(<ChatProvider adapter={value.adapter}><MicControl onText={vi.fn()} /></ChatProvider>)
    await waitFor(() => expect(value.fetch).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Use microphone' })).toBeNull()
  })

  it('uses the manifest capability and posts multipart audio', async () => {
    vi.stubGlobal('MediaRecorder', Recorder)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } })
    const value = adapter(Response.json({ text: 'hello' }))
    const onText = vi.fn()
    render(<ChatProvider adapter={value.adapter}><MicControl onText={onText} /></ChatProvider>)
    const button = await screen.findByRole('button', { name: 'Use microphone' })
    fireEvent.click(button)
    await waitFor(() => expect(button.parentElement?.className).toContain('animate-pulse'))
    fireEvent.click(button)
    await waitFor(() => expect(onText).toHaveBeenCalledWith('hello'))
    const [, init] = value.fetch.mock.calls[1] as [string, RequestInit]
    expect(value.fetch.mock.calls[1]?.[0]).toBe('/api/ai/v1/audio/transcriptions')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('model')).toBe('whisper-1')
    expect((init.body as FormData).get('file')).toBeInstanceOf(File)
  })

  it('hides when transcription is unavailable', async () => {
    vi.stubGlobal('MediaRecorder', Recorder)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } })
    const value = adapter(Response.json({ text: 'hello' }), false)
    render(<ChatProvider adapter={value.adapter}><MicControl onText={vi.fn()} /></ChatProvider>)
    await waitFor(() => expect(value.fetch).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Use microphone' })).toBeNull()
  })

  it('surfaces gateway and empty transcript errors', async () => {
    vi.stubGlobal('MediaRecorder', Recorder)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } })
    const value = adapter(new Response(JSON.stringify({ error: { message: 'Transcription denied' } }), { status: 403 }))
    render(<ChatProvider adapter={value.adapter}><MicControl onText={vi.fn()} /></ChatProvider>)
    const button = await screen.findByRole('button', { name: 'Use microphone' })
    fireEvent.click(button)
    await waitFor(() => expect(button.parentElement?.className).toContain('animate-pulse'))
    fireEvent.click(button)
    expect(await screen.findByText('Transcription denied')).toBeTruthy()
  })
})
