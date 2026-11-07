'use client';

import { Alert, AlertDescription, AlertTitle, Button } from '@frogbotai/ui';
import { useConfig, useRouter } from '@frogbotai/ui/admin';
import { useState } from 'react';

type SeedState =
  | { status: 'idle' | 'seeding' | 'seeded' }
  | { status: 'failed'; error: string };

/** The Seed panel's button: adds the sample data, then refreshes the dashboard. */
export function SeedButton() {
  const { config } = useConfig();
  const router = useRouter();
  const [state, setState] = useState<SeedState>({ status: 'idle' });

  async function seedDatabase() {
    setState({ status: 'seeding' });

    try {
      const response = await fetch(
        `${config.serverURL}${config.routes.api}/seed`,
        {
          method: 'POST',
          credentials: 'include',
        },
      );

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setState({
          status: 'failed',
          error: body.error ?? `Request failed (${response.status}).`,
        });

        return;
      }

      setState({ status: 'seeded' });
      router.refresh();
    } catch (error) {
      setState({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <Alert variant="primary">
      <div>
        <AlertTitle>Add sample data</AlertTitle>
        <AlertDescription>
          <p>
            Add sample data to try the app: three projects with tasks on a
            board, every task assigned to you. This only works while the app has
            no data of its own.
          </p>
          <Button
            disabled={state.status === 'seeding'}
            onClick={seedDatabase}
            type="button"
          >
            {state.status === 'seeding' ? 'Adding…' : 'Add sample data'}
          </Button>
          <p role="status">
            {state.status === 'seeded' && 'Done. Open Tasks to see the board.'}
            {state.status === 'failed' &&
              `Adding sample data failed: ${state.error}`}
          </p>
        </AlertDescription>
      </div>
    </Alert>
  );
}
