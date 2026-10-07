import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

Object.defineProperty(Element.prototype, 'hasPointerCapture', { value: () => false });
Object.defineProperty(Element.prototype, 'releasePointerCapture', { value: () => undefined });
Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => undefined });
Object.defineProperty(Element.prototype, 'scrollTo', { value: () => undefined });
Object.defineProperty(Element.prototype, 'setPointerCapture', { value: () => undefined });

function readBlob<T extends 'arrayBuffer' | 'text'>(blob: Blob, as: T) {
  return new Promise<T extends 'text' ? string : ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result as T extends 'text' ? string : ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read the blob as ${as}`));

    if (as === 'text') reader.readAsText(blob);
    else reader.readAsArrayBuffer(blob);
  });
}

Object.defineProperty(Blob.prototype, 'arrayBuffer', {
  value(this: Blob) {
    return readBlob(this, 'arrayBuffer');
  },
});

Object.defineProperty(Blob.prototype, 'text', {
  value(this: Blob) {
    return readBlob(this, 'text');
  },
});

globalThis.ResizeObserver = class {
  disconnect() {}
  observe() {}
  unobserve() {}
};

globalThis.IntersectionObserver = class {
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }

  unobserve() {}
} as unknown as typeof IntersectionObserver;

afterEach(cleanup);
