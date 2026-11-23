'use client';

import './index.css';

import { useEffect, useState } from 'react';

import { Dialog, DialogContent, DialogTitle } from '../../../components/dialog.js';

type Image = { alt: string; href?: string; name: string; src: string };

const THUMBNAIL = '.upload-relationship-details__thumbnail';

const IMAGE_FILE = /\.(avif|bmp|gif|heic|heif|ico|jpe?g|png|svg|tiff?|webp)$/i;

/**
 * Reads the image an upload field's thumbnail shows, preferring the original file. A video or PDF
 * can have an image thumbnail too, so the original counts only when its type or name says image.
 */
export function readThumbnailImage(target: EventTarget | null): Image | null {
  if (!(target instanceof Element)) return null;

  const img = target.closest(THUMBNAIL)?.querySelector('img');

  if (!img) return null;

  const details = img.closest('.upload-relationship-details');
  const link = details?.querySelector<HTMLAnchorElement>(
    '.upload-relationship-details__filename a',
  );

  const name = link?.textContent?.trim() || img.alt;
  const meta = details?.querySelector('.upload-relationship-details__meta')?.textContent ?? '';
  const isImage =
    /\bimage\//.test(meta) || IMAGE_FILE.test(new URL(link?.href ?? img.src, 'http://x').pathname);

  if (!isImage) return null;

  return { alt: img.alt, href: link?.href, name, src: link?.href || img.currentSrc || img.src };
}

/**
 * Clicking an image in an upload field opens it full size over the page, as Notion, Linear and
 * Airtable do, so people see the picture without leaving the record.
 */
export function ImageViewer() {
  const [image, setImage] = useState<Image | null>(null);

  useEffect(() => {
    const open = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const found = readThumbnailImage(event.target);

      if (!found) return;

      event.preventDefault();
      setImage(found);
    };

    document.addEventListener('click', open);

    return () => document.removeEventListener('click', open);
  }, []);

  return (
    <Dialog onOpenChange={(open) => !open && setImage(null)} open={image !== null}>
      {image ? (
        <DialogContent aria-describedby={undefined} className="fb-image-viewer">
          <DialogTitle className="fb-image-viewer__title">{image.name}</DialogTitle>
          <img alt={image.alt} className="fb-image-viewer__image" src={image.src} />
          {image.href ? (
            <a
              className="fb-image-viewer__original"
              href={image.href}
              rel="noreferrer"
              target="_blank"
            >
              Open original
            </a>
          ) : null}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
