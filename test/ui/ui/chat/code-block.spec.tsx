import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CodeBlock } from '../../../../packages/ui/src/chat/code-block';
import { Message, type MessageProps } from '../../../../packages/ui/src/chat/message';
import { MessagePart } from '../../../../packages/ui/src/chat/message-part';

function renderCodeInMessage(role: MessageProps['role']) {
  return render(
    <Message role={role}>
      <MessagePart
        role={role}
        part={{ type: 'text', text: '```js\nconst x = 1\n```', state: 'done' }}
      />
    </Message>,
  );
}

describe('CodeBlock', () => {
  it('renders code literally with its language', () => {
    const { container } = render(<CodeBlock code={'<script>bad()</script>'} language="html" />);

    expect(screen.getByText('<script>bad()</script>')).toBeTruthy();
    expect(container.querySelector('pre')?.dataset.language).toBe('html');
    expect(container.querySelector('pre')?.className).toBe('fb-code-block');
    expect(container.querySelector('script')).toBeNull();
  });

  it('marks code blocks in user messages without a theme provider', () => {
    const { container } = renderCodeInMessage('user');

    expect(container.querySelector('pre')?.classList.contains('fb-code-block--user')).toBe(true);
  });

  it('leaves code blocks in assistant messages unmarked', () => {
    const { container } = renderCodeInMessage('assistant');

    expect(container.querySelector('pre')?.classList.contains('fb-code-block--user')).toBe(false);
  });
});
