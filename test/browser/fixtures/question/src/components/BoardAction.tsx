'use client';

import { Button } from '@frogbotai/ui';

function FixtureButton({ label }: { label: string }) {
  return (
    <Button type="button" variant="secondary">
      {label}
    </Button>
  );
}

export function BoardAction() {
  return <FixtureButton label="Board action" />;
}

export function BoardToolbar() {
  return <FixtureButton label="Board tool" />;
}

export function ListAction() {
  return <FixtureButton label="List action" />;
}

export function ListToolbar() {
  return <FixtureButton label="List tool" />;
}

export function TimesheetAction() {
  return <FixtureButton label="Timesheet action" />;
}
