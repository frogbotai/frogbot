import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

describe('Card', () => {
  it('renders the BEM classes and preserves external classes', () => {
    render(
      <Card className="custom-card" data-testid="card">
        <CardHeader data-testid="header">
          <CardTitle data-testid="title">Title</CardTitle>
          <CardDescription data-testid="description">Description</CardDescription>
        </CardHeader>
        <CardContent data-testid="content">Content</CardContent>
        <CardFooter data-testid="footer">Footer</CardFooter>
      </Card>,
    );

    expect(screen.getByTestId('card').className).toBe('fb-card custom-card');
    expect(screen.getByTestId('header').className).toBe('fb-card__header');
    expect(screen.getByTestId('title').className).toBe('fb-card__title');
    expect(screen.getByTestId('description').className).toBe('fb-card__description');
    expect(screen.getByTestId('content').className).toBe('fb-card__content');
    expect(screen.getByTestId('footer').className).toBe('fb-card__footer');
  });
});
