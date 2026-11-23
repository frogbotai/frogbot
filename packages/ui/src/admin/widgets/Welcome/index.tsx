import type { WidgetServerProps } from 'payload';

import { firstName } from './firstName.js';
import { Greeting } from './Greeting.client.js';

/**
 * The dashboard's greeting, as Asana's Home opens: today's date and "Good morning, Ada", centered
 * and quiet. The name is the first word of the user's title field, or the part of their email
 * before the `@`.
 */
export function WelcomeWidget({ req, user }: WidgetServerProps) {
  const userCollection = req.payload.config.collections.find(
    ({ slug }) => slug === req.payload.config.admin.user,
  );

  const data = (user ?? {}) as Record<string, unknown>;
  const useAsTitle = userCollection?.admin.useAsTitle;

  return (
    <Greeting
      locale={req.i18n.language}
      name={firstName({
        email: data.email,
        title: useAsTitle ? data[useAsTitle] : undefined,
        username: data.username,
      })}
    />
  );
}
