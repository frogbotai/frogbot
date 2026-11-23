import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ImageViewer } from '../../../../../packages/ui/src/admin/elements/ImageViewer/index.client.js';

function UploadValue({
  file = 'warehouse.png',
  image = true,
  mime = 'image/png',
}: {
  file?: string;
  image?: boolean;
  mime?: string;
}) {
  return (
    <div className="upload-relationship-details">
      <div className="thumbnail upload-relationship-details__thumbnail">
        {image ? (
          <img
            alt={file === 'warehouse.png' ? 'Warehouse' : file}
            src={`/api/media/file/${file}-thumb.png`}
          />
        ) : (
          <svg />
        )}
      </div>
      <p className="upload-relationship-details__filename">
        <a href={`/api/media/file/${file}`}>{file}</a>
      </p>
      <p className="upload-relationship-details__meta">{mime}</p>
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
    fireEvent.click(screen.getByAltText('Warehouse'), { altKey: true });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([
    ['clip.mp4', 'video/mp4'],
    ['contract.pdf', 'application/pdf'],
  ])('leaves %s alone instead of opening the file as an image', (file, mime) => {
    render(
      <>
        <ImageViewer />
        <UploadValue file={file} mime={mime} />
      </>,
    );

    fireEvent.click(screen.getByAltText(file));

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
