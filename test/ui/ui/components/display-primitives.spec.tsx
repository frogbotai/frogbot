import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Dot,
  ShimmerEffect,
  StaggeredShimmers,
  Textarea,
} from '../../../../packages/ui/src/index';
it('renders display primitives with variants and BEM classes', () => {
  render(
    <>
      <Badge variant="success">Ready</Badge>
      <Alert variant="warning">
        <div>
          <AlertTitle>Warning</AlertTitle>
          <AlertDescription>Check this.</AlertDescription>
        </div>
      </Alert>
      <Textarea aria-label="Notes" />
      <Dot variant="destructive" animation />
      <ShimmerEffect />
    </>,
  );
  expect(screen.getByText('Ready').className).toContain('fb-badge--success');
  expect(screen.getByRole('alert').className).toContain('fb-alert--warning');
  expect(screen.getByRole('textbox').className).toContain('fb-textarea');
  expect(document.querySelector('.fb-shimmer__shine')).toBeTruthy();
});
it('renders staggered shimmers immediately when requested', () => {
  render(<StaggeredShimmers count={3} renderDelay={0} />);
  expect(document.querySelectorAll('.fb-shimmer')).toHaveLength(3);
});
