import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useTranscription } from './use-transcription'

class Recorder {
  static instances: Recorder[] = []
  static isTypeSupported = vi.fn(() => true)
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  mimeType: string

  constructor(_: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? 'audio/webm'
    Recorder.instances.push(this)
  }

  start() {}

  stop() {
    this.ondataavailable?.({ data: new Blob(['voice'], { type: this.mimeType }) })
    this.onstop?.()
  }
}

const track = { stop: vi.fn() }
const stream = { getTracks: () => [track] } as unknown as MediaStream

describe('useTranscription', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    Recorder.instances = []
    track.stop.mockClear()
  })

  function setup(getUserMedia = vi.fn().mockResolvedValue(stream), text = 'spoken words') {
    vi.stubGlobal('MediaRecorder', Recorder)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
    const transcribe = vi.fn().mockResolvedValue(text)
    const onText = vi.fn()
    return { ...renderHook(() => useTranscription({ transcribe, onText })), getUserMedia, onText, transcribe }
  }

  it('records, transcribes, and appends text', async () => {
    const result = setup()
    await act(() => result.result.current.start())
    expect(result.result.current.status).toBe('recording')
    act(() => result.result.current.stop())
    await waitFor(() => expect(result.result.current.status).toBe('idle'))
    expect(result.transcribe).toHaveBeenCalledWith(expect.any(File))
    expect(result.onText).toHaveBeenCalledWith('spoken words')
    expect(track.stop).toHaveBeenCalledOnce()
  })

  it('surfaces permission errors and returns idle', async () => {
    const result = setup(vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')))
    await act(() => result.result.current.start())
    expect(result.result.current.status).toBe('idle')
    expect(result.result.current.error).toBe('Permission denied')
  })

  it('stops tracks when unmounted while recording', async () => {
    const result = setup()
    await act(() => result.result.current.start())
    result.unmount()
    expect(track.stop).toHaveBeenCalledOnce()
  })

  it('falls back to mp4 recording on Safari', async () => {
    Recorder.isTypeSupported.mockImplementation((type) => type === 'audio/mp4')
    const result = setup()
    await act(() => result.result.current.start())
    expect(Recorder.instances[0]?.mimeType).toBe('audio/mp4')
  })

  it('surfaces empty transcripts without appending text', async () => {
    const result = setup(undefined, '   ')
    await act(() => result.result.current.start())
    act(() => result.result.current.stop())
    await waitFor(() => expect(result.result.current.error).toBe('No speech detected'))
    expect(result.onText).not.toHaveBeenCalled()
  })
})
