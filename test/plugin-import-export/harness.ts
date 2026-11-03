import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { usersSlug } from './shared.js';

const password = 'frogbot-import-password';

/** Builds a CSV, quoting cells that hold a comma or a quote. */
export function csv(rows: string[][]): Buffer {
  return Buffer.from(
    rows
      .map((row) =>
        row.map((cell) => (/[",]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell)),
      )
      .map((row) => row.join(','))
      .join('\n'),
  );
}

/** Creates a user and signs them in over REST. */
export async function signIn(booted: BootedFrogBot, email: string) {
  const user = (await booted.frogbot.create({
    collection: usersSlug,
    data: { email, password },
    overrideAccess: true,
  } as never)) as unknown as { id: number | string };

  const login = await booted.restClient.post<{ token: string }>(`/api/${usersSlug}/login`, {
    email,
    password,
  });

  if (login.status !== 200) throw new Error(`Login failed with ${login.status}.`);

  return {
    user: { id: user.id, collection: usersSlug },
    headers: { Authorization: `JWT ${login.body.token}` },
  };
}
