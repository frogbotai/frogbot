import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { iconNames, iconRegistry, isIconName } from './registry';
import { iconNames as configuredIconNames } from '../../../frogbot/src/adminIcons';

describe('iconRegistry', () => {
  it('maps every component icon export to a sorted kebab-case name', () => {
    expect(iconNames).toEqual([...iconNames].sort());
    expect(iconNames).toContain('robot');
    expect(iconNames).toContain('bubble-chat');
    expect(iconNames).not.toContain('create-lucide');
    expect(iconNames).toEqual(configuredIconNames);
  });

  it('renders registered icons', () => {
    const { container } = render(createElement(iconRegistry.robot, { size: 24 }));
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('identifies registered icon names', () => {
    expect(isIconName('robot')).toBe(true);
    expect(isIconName('unknown')).toBe(false);
  });
});
