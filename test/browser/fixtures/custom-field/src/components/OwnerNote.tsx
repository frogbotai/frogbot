import type { TextFieldServerProps } from 'frogbot';

export const OwnerNote = ({ req }: TextFieldServerProps) => (
  <div data-testid="owner-note">{Object.keys(req.frogbot.collections).length}</div>
);
