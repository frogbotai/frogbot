const barCount = 40;
const minimumHeight = 3;

export function AudioWaveform({ audioData }: { audioData: Float32Array | null }) {
  const step = audioData ? Math.floor(audioData.length / barCount) : 0;
  const bars = Array.from({ length: barCount }, (_, index) =>
    audioData
      ? Math.max(minimumHeight, Math.abs((audioData[index * step] ?? 0) * 150))
      : minimumHeight,
  );

  return (
    <div className="fb-audio-waveform" aria-hidden="true">
      {bars.map((height, index) => (
        <div className="fb-audio-waveform__bar" key={index} style={{ height: `${height}px` }} />
      ))}
    </div>
  );
}
