import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { iconNames as configuredIconNames } from '../../../../packages/frogbot/src/admin/icons';
import { iconNames, iconRegistry, isIconName } from '../../../../packages/ui/src/icons/registry';

describe('iconRegistry', () => {
  it('maps every component icon export to a sorted kebab-case name', () => {
    expect(iconNames).toEqual([...iconNames].sort());
    expect(iconNames).toContain('robot');
    expect(iconNames).toContain('bubble-chat');
    expect(iconNames).toContain('key-round');
    expect(iconNames).toContain('message-square-text');
    expect(iconNames).toContain('calendar');
    expect(iconNames).toContain('shopping-cart');
    expect(iconNames).toContain('chart-bar');
    expect(iconNames).toContain('headset');
    expect(iconNames).toContain('user-shield');
    expect(iconNames).toContain('qr-code');
    expect(iconNames).toContain('id-card');
    expect(iconNames).toContain('branch');
    expect(iconNames).toContain('volume');
    expect(iconNames).toContain('dollar');
    expect(iconNames).toContain('lock-check');
    expect(iconNames).toContain('trending-up');
    expect(iconNames).toContain('money-bag');
    expect(iconNames).toContain('map-pin');
    expect(iconNames).not.toContain('create-lucide');
    expect(iconNames).toEqual(configuredIconNames);
  });

  it('renders registered icons', () => {
    const { container } = render(createElement(iconRegistry.robot, { size: 24 }));

    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('keeps bubble-chat consumers on the complete dot-free drawing', () => {
    const { container } = render(createElement(iconRegistry['bubble-chat'], { size: 20 }));
    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('class')).toContain('lucide-bubble-chat-icon');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg?.querySelector('circle')).toBeNull();
    expect(svg?.querySelector('path')?.getAttribute('d')).toMatch(/Z$/);
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
  });

  it('renders message-square-text as a square bubble with three text lines', () => {
    const { container } = render(createElement(iconRegistry['message-square-text'], { size: 20 }));
    const svg = container.querySelector('svg');
    const paths = [...container.querySelectorAll('path')];

    expect(svg?.getAttribute('class')).toContain('lucide-message-square-text-icon');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(paths).toHaveLength(4);
    expect(paths[0].getAttribute('d')).toMatch(/z$/);
    expect(paths.slice(1).map((path) => path.getAttribute('d'))).toEqual([
      'M7 11h10',
      'M7 15h6',
      'M7 7h8',
    ]);
  });

  it('identifies registered icon names', () => {
    expect(isIconName('robot')).toBe(true);
    expect(isIconName('unknown')).toBe(false);
  });
});
