import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Slider } from '../../../../packages/ui/src/index';

const stops = ['Default', 'Low', 'High · 16k'];

function ControlledSlider({ initial = 0 }: { initial?: number }) {
  const [value, setValue] = useState(initial);

  return <Slider aria-label="Reasoning" stops={stops} value={value} onValueChange={setValue} />;
}

function dots(container: HTMLElement) {
  return [...container.querySelectorAll('.fb-slider__dot')];
}

function title(container: HTMLElement) {
  return container.querySelector('.fb-slider__value');
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

  it('renders one dot per stop and no stop labels', () => {
    const { container } = render(<ControlledSlider />);

    expect(dots(container)).toHaveLength(stops.length);
    expect(dots(container).map((dot) => dot.textContent)).toEqual(['', '', '']);
    expect(container.querySelector('.fb-slider__stops, .fb-slider__stop')).toBeNull();
  });

  it('shows the current stop as a title hidden from assistive technology', () => {
    const { container } = render(<ControlledSlider initial={1} />);

    expect(title(container)?.textContent).toBe('Low');
    expect(title(container)?.getAttribute('aria-hidden')).toBe('true');
  });

  it('hides the drawn track from assistive technology', () => {
    const { container } = render(<ControlledSlider />);

    expect(container.querySelector('.fb-slider__track')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('fills only the dots before the current stop', () => {
    const { container } = render(<ControlledSlider initial={2} />);

    const filled = dots(container).map((dot) => dot.classList.contains('fb-slider__dot--filled'));

    expect(filled).toEqual([true, true, false]);
  });

  it('places each dot by its stop index', () => {
    const { container } = render(<ControlledSlider initial={1} />);

    const indexes = dots(container).map((dot) =>
      (dot as HTMLElement).style.getPropertyValue('--fb-slider-index'),
    );

    expect(indexes).toEqual(['0', '1', '2']);
    expect(
      (container.firstElementChild as HTMLElement).style.getPropertyValue('--fb-slider-last'),
    ).toBe('2');
  });

  it('renders one dot for a single stop without error', () => {
    const { container } = render(
      <Slider aria-label="Level" stops={['Default']} value={0} onValueChange={() => undefined} />,
    );

    expect(dots(container)).toHaveLength(1);
    expect(title(container)?.textContent).toBe('Default');
    expect(screen.getByRole('slider').getAttribute('max')).toBe('0');
  });

  it('shows an empty title for a value outside the stops', () => {
    const { container } = render(
      <Slider aria-label="Level" stops={stops} value={5} onValueChange={() => undefined} />,
    );

    expect(title(container)?.textContent).toBe('');
    expect(dots(container)).toHaveLength(stops.length);
    expect(screen.getByRole('slider')).toBeTruthy();
  });

  it.each([
    [5, '1'],
    [-1, '0'],
  ])('clamps the fill for the out-of-range value %i to %s', (value, progress) => {
    const { container } = render(
      <Slider aria-label="Level" stops={stops} value={value} onValueChange={() => undefined} />,
    );

    expect(
      (container.firstElementChild as HTMLElement).style.getPropertyValue('--fb-slider-progress'),
    ).toBe(progress);
  });

  it('re-lays out the dots when the stops change', () => {
    const { container, rerender } = render(
      <Slider aria-label="Level" stops={stops} value={2} onValueChange={() => undefined} />,
    );

    rerender(
      <Slider
        aria-label="Level"
        stops={['Default', 'High']}
        value={1}
        onValueChange={() => undefined}
      />,
    );

    expect(dots(container)).toHaveLength(2);
    expect(
      (container.firstElementChild as HTMLElement).style.getPropertyValue('--fb-slider-last'),
    ).toBe('1');
    expect(screen.getByRole('slider').getAttribute('max')).toBe('1');
  });

  it('announces the current stop label as the value text', () => {
    render(<ControlledSlider initial={2} />);

    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('High · 16k');
  });

  it('updates the title after a controlled change', () => {
    const { container } = render(<ControlledSlider />);

    fireEvent.change(screen.getByRole('slider'), { target: { value: '2' } });

    expect(title(container)?.textContent).toBe('High · 16k');
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

  it('names the range input with the caller aria-label', () => {
    render(<Slider aria-label="Effort" stops={stops} value={0} onValueChange={() => undefined} />);

    expect(screen.getByRole('slider', { name: 'Effort' }).getAttribute('type')).toBe('range');
  });
});
