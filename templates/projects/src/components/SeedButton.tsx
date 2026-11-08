'use client';

import { Alert, AlertDescription, AlertTitle, Button } from '@frogbotai/ui';
import { useConfig, useRouter } from '@frogbotai/ui/admin';
import { useState } from 'react';

type SeedState =
  | { status: 'idle' | 'seeding' | 'seeded' }
  | { status: 'failed'; error: string };

/** The dashboard's Seed button; `SeedPanel` renders it only while the app has no sample data. */
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
        <AlertTitle>Seed your database</AlertTitle>
        <AlertDescription>
          <p>
            Fill this app with three sample projects and their tasks on a board,
            all assigned to you. It works only while the app has no projects,
            and changes nothing else.
          </p>
          <Button
            disabled={state.status === 'seeding'}
            onClick={seedDatabase}
            type="button"
          >
            {state.status === 'seeding' ? 'Seeding…' : 'Seed your database'}
          </Button>
          <p role="status">
            {state.status === 'seeded' && 'Done. Open Tasks to see the board.'}
            {state.status === 'failed' && `Seeding failed: ${state.error}`}
          </p>
        </AlertDescription>
      </div>
    </Alert>
  );
}
