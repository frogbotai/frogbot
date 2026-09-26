import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Slider } from '../../../../packages/ui/src/index';

const stops = ['Default', 'Low', 'High · 16k'];

function ControlledSlider({ initial = 0 }: { initial?: number }) {
  const [value, setValue] = useState(initial);

  return <Slider aria-label="Reasoning" stops={stops} value={value} onValueChange={setValue} />;
}

function stopLabels(container: HTMLElement) {
  return [...container.querySelectorAll('.fb-slider__stop')].map((stop) => stop.textContent);
}

describe('Slider', () => {
  it('renders a range input with one integer step per stop', () => {
    render(<ControlledSlider />);

    const slider = screen.getByRole('slider', { name: 'Reasoning' });

    expect(slider.getAttribute('type')).toBe('range');
    expect(slider.getAttribute('min')).toBe('0');
    expect(slider.getAttribute('max')).toBe('2');
    expect(slider.getAttribute('step')).toBe('1');
  });

  it('renders every stop label visibly in order', () => {
    const { container } = render(<ControlledSlider />);

    expect(stopLabels(container)).toEqual(stops);
  });

  it('announces the current stop label as the value text', () => {
    render(<ControlledSlider initial={2} />);

    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('High · 16k');
  });

  it('marks only the current stop label as active', () => {
    const { container } = render(<ControlledSlider initial={1} />);

    const active = container.querySelectorAll('.fb-slider__stop--active');

    expect([...active].map((stop) => stop.textContent)).toEqual(['Low']);
  });

  it('reports the chosen stop index when the value changes', () => {
    const onValueChange = vi.fn();

    render(<Slider aria-label="Level" stops={stops} value={0} onValueChange={onValueChange} />);

    fireEvent.change(screen.getByRole('slider'), { target: { value: '2' } });

    expect(onValueChange).toHaveBeenCalledWith(2);
  });

  it('updates the value text after a controlled change', () => {
    render(<ControlledSlider />);

    const slider = screen.getByRole('slider');

    fireEvent.change(slider, { target: { value: '1' } });

    expect(slider.getAttribute('aria-valuetext')).toBe('Low');
  });

  it('keeps the caller class on the root and element props on the input', () => {
    const { container } = render(
      <Slider
        className="custom"
        id="level"
        disabled
        aria-label="Level"
        stops={stops}
        value={0}
        onValueChange={() => undefined}
      />,
    );

    const slider = screen.getByRole('slider', { name: 'Level' }) as HTMLInputElement;

    expect(container.firstElementChild?.className).toBe('fb-slider custom');
    expect(slider.id).toBe('level');
    expect(slider.disabled).toBe(true);
  });

  it('hides the visible stop labels from assistive technology', () => {
    const { container } = render(<ControlledSlider />);

    expect(container.querySelector('.fb-slider__stops')?.getAttribute('aria-hidden')).toBe('true');
  });
});
