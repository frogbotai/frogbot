import { RefreshRouteOnSave, useLivePreview } from '@frogbotai/live-preview-react';
import { render, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

it('RefreshRouteOnSave calls refresh when the admin posts a document event', async () => {
  const refresh = vi.fn();

  render(<RefreshRouteOnSave refresh={refresh} serverURL={window.location.origin} />);
  refresh.mockClear();

  window.dispatchEvent(
    new MessageEvent('message', {
      origin: window.location.origin,
      data: { type: 'payload-document-event' },
    }),
  );

  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
});

it('useLivePreview merges posted data through the request handler', async () => {
  const { result } = renderHook(() =>
    useLivePreview({
      initialData: { id: '1', title: 'A' },
      serverURL: window.location.origin,
      requestHandler: async ({ data }) => Response.json(data.data),
    }),
  );

  window.dispatchEvent(
    new MessageEvent('message', {
      origin: window.location.origin,
      data: {
        type: 'payload-live-preview',
        collectionSlug: 'pages',
        data: { id: '1', title: 'B' },
      },
    }),
  );

  await waitFor(() => expect(result.current.data.title).toBe('B'));
});
