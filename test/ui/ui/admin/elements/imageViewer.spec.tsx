import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ImageViewer } from '../../../../../packages/ui/src/admin/elements/ImageViewer/index.client.js';

function UploadValue({ image = true }: { image?: boolean }) {
  return (
    <div className="upload-relationship-details">
      <div className="thumbnail upload-relationship-details__thumbnail">
        {image ? <img alt="Warehouse" src="/api/media/file/warehouse-300x300.png" /> : <svg />}
      </div>
      <p className="upload-relationship-details__filename">
        <a href="/api/media/file/warehouse.png">warehouse.png</a>
      </p>
    </div>
  );
}

describe('ImageViewer', () => {
  it('opens the original file full size when an upload thumbnail is clicked', () => {
    render(
      <>
        <ImageViewer />
        <UploadValue />
      </>,
    );

    fireEvent.click(screen.getByAltText('Warehouse'));

    const dialog = screen.getByRole('dialog', { name: 'warehouse.png' });
    const image = dialog.querySelector('img');

    expect(image?.getAttribute('src')).toMatch(/\/api\/media\/file\/warehouse\.png$/);
    expect(screen.getByRole('link', { name: 'Open original' })).toBeTruthy();

    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ignores thumbnails that are not images, and modified clicks', () => {
    const { container } = render(
      <>
        <ImageViewer />
        <UploadValue image={false} />
        <UploadValue />
      </>,
    );

    fireEvent.click(container.querySelector('svg')!);
    fireEvent.click(screen.getByAltText('Warehouse'), { metaKey: true });

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
