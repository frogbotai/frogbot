import { render } from '@testing-library/react';
import type { ClientCollectionConfig, Column } from 'payload';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@payloadcms/ui', () => ({
  DocumentIcon: () => <svg data-testid="document-icon" />,
  toast: { error: vi.fn() },
  useConfig: () => ({ config: { admin: { dateFormat: 'PP' }, routes: { api: '/api' } } }),
  useTranslation: () => ({ i18n: { language: 'en', t: (key: string) => key } }),
}));

vi.mock('@payloadcms/ui/shared', () => ({
  formatDocTitle: ({ data }: { data: { name?: string } }) => data.name ?? '',
}));

vi.mock('../../../../../packages/ui/src/admin/fields/FieldCell/index.client.js', () => ({
  FieldCell: ({ cellData, viewType }: { cellData: unknown; viewType: string }) => (
    <span data-view-type={viewType}>{String(cellData)}</span>
  ),
}));

const { RecordCard } = await import('../../../../../packages/ui/src/admin/views/cards/RecordCard');

const collectionConfig = {
  admin: { custom: { frogbot: { useAsDone: 'done' } }, useAsTitle: 'name' },
  labels: { plural: 'Companies', singular: 'Company' },
  slug: 'companies',
} as unknown as ClientCollectionConfig;

const cardColumns = [
  { accessor: 'industry', field: { label: 'Industry', name: 'industry', type: 'select' } },
] as unknown as Column[];

const logo = { id: 1, mimeType: 'image/webp', url: '/api/media/file/logo.webp', width: 256 };

function renderCard(props: Partial<Parameters<typeof RecordCard>[0]> = {}) {
  return render(
    <RecordCard
      canToggleDone
      cardColumns={cardColumns}
      collectionConfig={collectionConfig}
      collectionSlug="companies"
      imageArea="always"
      onSave={vi.fn()}
      row={{ id: 'a', industry: 'software', logo, name: 'Lumen Labs' }}
      thumbnail={{ field: 'logo', fit: 'cover' }}
      viewType="gallery"
      {...props}
    />,
  );
}

describe('RecordCard', () => {
  it('renders the image, done check, title and fields', () => {
    const { container, getByRole } = renderCard();

    expect(container.querySelector('.fb-card__image img')?.getAttribute('src')).toBe(logo.url);
    expect(container.querySelector('.fb-card__image--contain')).toBeNull();
    expect(getByRole('button', { name: 'Mark complete' })).toBeTruthy();
    expect(container.querySelector('.fb-card__title')?.textContent).toBe('Lumen Labs');
    expect(container.querySelector('.fb-card__field-label')?.textContent).toBe('Industry');
    expect(container.querySelector('[data-view-type="gallery"]')?.textContent).toBe('software');
  });

  it('fits the image without cropping with contain', () => {
    const { container } = renderCard({ thumbnail: { field: 'logo', fit: 'contain' } });

    expect(container.querySelector('.fb-card__image--contain img')).not.toBeNull();
  });

  it("keeps the image area with Payload's document icon when a gallery card has no image", () => {
    const { container, getByTestId } = renderCard({
      row: { id: 'a', industry: 'finance', logo: null, name: 'No logo company' },
    });

    expect(container.querySelector('.fb-card__image img')).toBeNull();
    expect(getByTestId('document-icon')).toBeTruthy();
  });

  it('leaves out the image area when a board card has no image', () => {
    const { container } = renderCard({
      imageArea: 'when-set',
      row: { id: 'a', logo: null, name: 'No logo company' },
      viewType: 'board',
    });

    expect(container.querySelector('.fb-card__image')).toBeNull();
    expect(container.querySelector('[data-view-type="board"]')).not.toBeNull();
  });

  it('draws no image area at all when the view turns images off', () => {
    const { container } = renderCard({ thumbnail: false });

    expect(container.querySelector('.fb-card__image')).toBeNull();
  });
});
