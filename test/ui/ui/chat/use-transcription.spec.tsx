import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useTranscription } from '../../../../packages/ui/src/chat/use-transcription';

class Recorder {
  static instances: Recorder[] = [];
  static isTypeSupported = vi.fn(() => true);
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  mimeType: string;

  constructor(_: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? 'audio/webm';
    Recorder.instances.push(this);
  }

  start() {}

  stop() {
    this.ondataavailable?.({ data: new Blob(['voice'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const track = { stop: vi.fn() };
const stream = { getTracks: () => [track] } as unknown as MediaStream;
const close = vi.fn();
const connect = vi.fn();
const getFloatTimeDomainData = vi.fn((data: Float32Array) => data.fill(0.5));
const analyser = {
  fftSize: 0,
  frequencyBinCount: 128,
  getFloatTimeDomainData,
  smoothingTimeConstant: 0,
};

class Context {
  close = close;
  createAnalyser = vi.fn(() => analyser);
  createMediaStreamSource = vi.fn(() => ({ connect }));
}

describe('useTranscription', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Recorder.instances = [];
    track.stop.mockClear();
    close.mockClear();
    connect.mockClear();
    getFloatTimeDomainData.mockClear();
  });

  function setup(getUserMedia = vi.fn().mockResolvedValue(stream), text = 'spoken words') {
    vi.stubGlobal('MediaRecorder', Recorder);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const transcribe = vi.fn().mockResolvedValue(text);
    const onText = vi.fn();
    return {
      ...renderHook(() => useTranscription({ transcribe, onText })),
      getUserMedia,
      onText,
      transcribe,
    };
  }

  it('records, transcribes, and appends text', async () => {
    const result = setup();
    await act(() => result.result.current.start());
    expect(result.result.current.status).toBe('recording');
    act(() => result.result.current.stop());
    await waitFor(() => expect(result.result.current.status).toBe('idle'));
    expect(result.transcribe).toHaveBeenCalledWith(expect.any(File));
    expect(result.onText).toHaveBeenCalledWith('spoken words');
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('samples audio and tears the analyser down on stop', async () => {
    const frame = vi.fn<(callback: FrameRequestCallback) => number>();
    const cancel = vi.fn();
    vi.stubGlobal('AudioContext', Context);
    vi.stubGlobal('requestAnimationFrame', frame);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const result = setup();
    await act(() => result.result.current.start());
    expect(analyser.fftSize).toBe(256);
    expect(analyser.smoothingTimeConstant).toBe(0.8);
    expect(connect).toHaveBeenCalledWith(analyser);
    act(() => frame.mock.calls[0]?.[0](0));
    expect(result.result.current.audioData?.[0]).toBe(0.5);
    act(() => result.result.current.stop());
    await waitFor(() => expect(result.result.current.status).toBe('idle'));
    expect(cancel).toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    expect(result.result.current.audioData).toBeNull();
  });

  it('closes the analyser when unmounted', async () => {
    vi.stubGlobal('AudioContext', Context);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const result = setup();
    await act(() => result.result.current.start());
    result.unmount();
    expect(close).toHaveBeenCalledOnce();
  });

  it('continues recording when the analyser cannot initialize', async () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('Unavailable');
        }
      },
    );
    const result = setup();
    await act(() => result.result.current.start());
    expect(result.result.current.status).toBe('recording');
    expect(result.result.current.audioData).toBeNull();
    act(() => result.result.current.stop());
    await waitFor(() => expect(result.onText).toHaveBeenCalledWith('spoken words'));
  });

  it('surfaces permission errors and returns idle', async () => {
    const result = setup(
      vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')),
    );
    await act(() => result.result.current.start());
    expect(result.result.current.status).toBe('idle');
    expect(result.result.current.error).toBe('Permission denied');
  });

  it('stops tracks when unmounted while recording', async () => {
    const result = setup();
    await act(() => result.result.current.start());
    result.unmount();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('falls back to mp4 recording on Safari', async () => {
    Recorder.isTypeSupported.mockImplementation((type) => type === 'audio/mp4');
    const result = setup();
    await act(() => result.result.current.start());
    expect(Recorder.instances[0]?.mimeType).toBe('audio/mp4');
  });

  it('surfaces empty transcripts without appending text', async () => {
    const result = setup(undefined, '   ');
    await act(() => result.result.current.start());
    act(() => result.result.current.stop());
    await waitFor(() => expect(result.result.current.error).toBe('No speech detected'));
    expect(result.onText).not.toHaveBeenCalled();
  });
});
