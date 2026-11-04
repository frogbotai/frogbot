'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@frogbotai/ui';
import { PopupList, toast, useConfig, useRouter, useSelection } from '@frogbotai/ui/admin';
import { useState } from 'react';

/** "Revoke selected" in the edit links list: selected links stop working at once. */
export function RevokeLinksMenuItem() {
  const { config } = useConfig();
  const { getSelectedIds, toggleAll } = useSelection();
  const router = useRouter();
  const [ids, setIds] = useState<(number | string)[]>([]);
  const [loading, setLoading] = useState(false);

  const start = () => {
    const selected = getSelectedIds();

    if (!selected.length) {
      toast.info('Select the links to revoke.');

      return;
    }

    setIds(selected);
  };

  const revoke = async () => {
    setLoading(true);

    const revokedAt = new Date().toISOString();
    const results = await Promise.all(
      ids.map((id) =>
        fetch(`${config.routes.api}/form-links/${encodeURIComponent(String(id))}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ revokedAt }),
        })
          .then((response) => response.ok)
          .catch(() => false),
      ),
    );

    const failed = results.filter((ok) => !ok).length;

    setLoading(false);
    setIds([]);
    toggleAll(false);

    const search = new URLSearchParams(window.location.search);

    search.set('_r', String(Date.now()));
    void router.replace(`?${search.toString()}`);

    if (failed) toast.error(`${failed} of ${ids.length} links could not be revoked.`);
    else toast.success(ids.length === 1 ? 'Link revoked.' : `${ids.length} links revoked.`);
  };

  const count = ids.length;

  return (
    <>
      <PopupList.Button onClick={start}>Revoke selected</PopupList.Button>
      <Dialog open={count > 0} onOpenChange={(open) => (open ? undefined : setIds([]))}>
        <DialogContent>
          <DialogTitle>Revoke {count === 1 ? 'this link' : `${count} links`}?</DialogTitle>
          <DialogDescription>
            {count === 1 ? 'It stops' : 'They stop'} working at once, and can&apos;t be turned back
            on. Send a new link if someone still needs one.
          </DialogDescription>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setIds([])}>
              Cancel
            </Button>
            <Button disabled={loading} type="button" onClick={() => void revoke()}>
              {loading ? 'Revoking…' : 'Revoke'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
