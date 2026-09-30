'use client';

import { Slider } from '@frogbotai/ui';
import { ThemeProvider } from '@frogbotai/ui/theme';
import { use, useState } from 'react';

import { deliberatorLevels, sliderFrameWidth } from '../../../../shared';

export default function SliderPage({
  searchParams,
}: {
  searchParams: Promise<{ count?: string }>;
}) {
  const { count } = use(searchParams);
  const stops = deliberatorLevels.slice(0, Number(count ?? deliberatorLevels.length));

  const [value, setValue] = useState(0);

  return (
    <ThemeProvider mode="light">
      <div data-testid="slider-frame" style={{ width: sliderFrameWidth }}>
        <Slider aria-label="Level" stops={stops} value={value} onValueChange={setValue} />
      </div>
    </ThemeProvider>
  );
}
