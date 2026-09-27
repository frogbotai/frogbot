'use client';

import './plugin-development.styles.css';

import { useConfig } from '@frogbotai/ui';

export function NotesPanel() {
  const { config } = useConfig();

  return <p className="plugin-notes-panel">Notes API: {config.routes.api}/notes</p>;
}
