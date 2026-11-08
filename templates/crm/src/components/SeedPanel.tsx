'use client';

import { Alert, AlertDescription, AlertTitle, Button } from '@frogbotai/ui';
import { useConfig, useRouter } from '@frogbotai/ui/admin';
import { useState } from 'react';

type SeedState =
  | { status: 'idle' | 'seeding' | 'seeded' }
  | { status: 'refused' | 'failed'; error: string };

export function SeedPanel() {
  if (process.env.NODE_ENV === 'production') return null;

  return <SeedPanelInner />;
}

function SeedPanelInner() {
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
          status: response.status === 409 ? 'refused' : 'failed',
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
        <AlertTitle>Load the sample CRM</AlertTitle>
        <AlertDescription>
          <p>
            Add eight companies with their contacts, deals, a week of meetings
            and a few tasks, so every view has something to show. It only adds
            records, and only while the CRM is empty. This panel is hidden in
            production.
          </p>
          <Button
            disabled={state.status === 'seeding' || state.status === 'seeded'}
            onClick={seedDatabase}
            type="button"
          >
            {state.status === 'seeding' ? 'Loading…' : 'Load sample data'}
          </Button>
          <p role="status">
            {state.status === 'seeded' &&
              'Done. Open Deals to see the pipeline.'}
            {state.status === 'refused' && state.error}
            {state.status === 'failed' && `Loading failed: ${state.error}`}
          </p>
        </AlertDescription>
      </div>
    </Alert>
  );
}
