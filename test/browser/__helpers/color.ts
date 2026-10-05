import { expect } from '@playwright/test';

function srgbChannels(color: string) {
  const srgb = color.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)/);

  if (srgb) return srgb.slice(1, 4).map(Number);

  const rgb = color.match(/^rgba?\((\d+), (\d+), (\d+)/);

  expect(rgb, `an rgb() or color(srgb) value, got ${color}`).not.toBeNull();

  return rgb!.slice(1, 4).map((value) => Number(value) / 255);
}

function linearChannels(color: string) {
  return srgbChannels(color).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
}

function luminance(color: string) {
  const [red, green, blue] = linearChannels(color);

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function lab(color: string) {
  const [red, green, blue] = linearChannels(color);

  const xyz = [
    (0.4124564 * red + 0.3575761 * green + 0.1804375 * blue) / 0.95047,
    0.2126729 * red + 0.7151522 * green + 0.072175 * blue,
    (0.0193339 * red + 0.119192 * green + 0.9503041 * blue) / 1.08883,
  ];

  const [x, y, z] = xyz.map((value) =>
    value > 216 / 24389 ? Math.cbrt(value) : (value * 24389) / 27 / 116 + 16 / 116,
  );

  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function contrast({ text, background }: { text: string; background: string }) {
  const [light, dark] = [luminance(text), luminance(background)].sort((a, b) => b - a);

  return (light + 0.05) / (dark + 0.05);
}

export function colorDifference(a: string, b: string) {
  const [first, second] = [lab(a), lab(b)];

  return Math.hypot(...first.map((value, index) => value - second[index]));
}
