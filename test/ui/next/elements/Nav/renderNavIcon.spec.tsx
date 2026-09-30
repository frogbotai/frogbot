import { BubbleChatIcon, KeyRoundIcon } from '@frogbotai/ui/icons';
import { render } from '@testing-library/react';
import type { ImportMap } from 'payload';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { renderNavIcon } from '../../../../../packages/next/src/elements/Nav/renderNavIcon';

function CustomIcon({ className, size }: { className?: string; size?: number }) {
  return <svg className={className} data-size={size} data-testid="custom-icon" />;
}

const importMap = { './CustomIcon#CustomIcon': CustomIcon } as unknown as ImportMap;

const args = { className: 'nav-icon', importMap, serverProps: {}, size: 20 };

describe('renderNavIcon', () => {
  it('renders a built-in icon name from the icon registry', () => {
    const icon = renderNavIcon({ ...args, icon: 'bubble-chat' });

    expect(renderToStaticMarkup(<>{icon}</>)).toBe(
      renderToStaticMarkup(<BubbleChatIcon className="nav-icon" size={20} />),
    );
  });

  it('renders the key-round icon name from the icon registry', () => {
    const icon = renderNavIcon({ ...args, icon: 'key-round' });

    expect(renderToStaticMarkup(<>{icon}</>)).toBe(
      renderToStaticMarkup(<KeyRoundIcon className="nav-icon" size={20} />),
    );
  });

  it('renders a component path through the import map', () => {
    const { getByTestId } = render(
      <>{renderNavIcon({ ...args, icon: './CustomIcon#CustomIcon' })}</>,
    );

    expect(getByTestId('custom-icon').getAttribute('class')).toBe('nav-icon');
    expect(getByTestId('custom-icon').dataset.size).toBe('20');
  });

  it('renders a component object through the import map', () => {
    const { getByTestId } = render(
      <>
        {renderNavIcon({
          ...args,
          icon: { exportName: 'CustomIcon', path: './CustomIcon' },
        })}
      </>,
    );

    expect(getByTestId('custom-icon').getAttribute('class')).toBe('nav-icon');
  });

  it('renders without a class name when none is given', () => {
    const { getByTestId } = render(
      <>{renderNavIcon({ ...args, className: undefined, icon: './CustomIcon#CustomIcon' })}</>,
    );

    expect(getByTestId('custom-icon').hasAttribute('class')).toBe(false);
  });

  it('returns undefined for an unknown plain string', () => {
    expect(renderNavIcon({ ...args, icon: 'not-an-icon' })).toBeUndefined();
  });

  it('returns undefined without an icon', () => {
    expect(renderNavIcon({ ...args, icon: undefined })).toBeUndefined();
  });
});
