import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AudioWaveform } from '../../../../packages/ui/src/chat/audio-waveform';

describe('AudioWaveform', () => {
  it('renders 40 flat bars without audio data', () => {
    const { container } = render(<AudioWaveform audioData={null} />);
    const bars = container.querySelectorAll('.fb-audio-waveform__bar');
    expect(bars).toHaveLength(40);
    expect(Array.from(bars).every((bar) => bar.getAttribute('style') === 'height: 3px;')).toBe(
      true,
    );
  });

  it('maps audio samples to bar heights and updates them', () => {
    const quiet = new Float32Array(128);
    quiet[0] = 0.1;
    quiet[3] = 0.2;
    const { container, rerender } = render(<AudioWaveform audioData={quiet} />);
    let bars = container.querySelectorAll('.fb-audio-waveform__bar');
    expect(Number.parseFloat((bars[0] as HTMLElement).style.height)).toBeCloseTo(15);
    expect(Number.parseFloat((bars[1] as HTMLElement).style.height)).toBeCloseTo(30);

    const loud = new Float32Array(128);
    loud[0] = 0.4;
    rerender(<AudioWaveform audioData={loud} />);
    bars = container.querySelectorAll('.fb-audio-waveform__bar');
    expect(Number.parseFloat((bars[0] as HTMLElement).style.height)).toBeCloseTo(60);
    expect(bars[1]?.getAttribute('style')).toBe('height: 3px;');
  });
});
