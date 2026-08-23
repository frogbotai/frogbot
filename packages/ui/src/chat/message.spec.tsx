import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Message } from './message';

describe('Message', () => {
  it.each(['system', 'user', 'assistant'] as const)('renders the %s role class', (role) => {
    render(<Message role={role}>Hello</Message>);

    expect(screen.getByRole('article').className).toBe(`fb-message fb-message--${role}`);
  });

  it('renders its BEM inventory and passes through className', () => {
    render(
      <Message
        role="user"
        avatar="You"
        actions={<button>Copy</button>}
        className="external-class"
      >
        Hello
      </Message>,
    );

    const article = screen.getByRole('article');
    expect(article.dataset.role).toBe('user');
    expect(article.className).toBe('fb-message fb-message--user external-class');
    expect(screen.getByText('You').className).toBe('fb-message__avatar');
    expect(screen.getByText('Hello').parentElement?.className).toBe(
      'fb-message__body fb-message__body--user',
    );
    expect(screen.getByText('Hello').className).toBe('fb-message__content');
    expect(screen.getByRole('button', { name: 'Copy' }).parentElement?.className).toBe(
      'fb-message__actions',
    );
  });
});
