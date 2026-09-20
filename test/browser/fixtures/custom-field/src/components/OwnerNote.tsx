import type { TextFieldServerComponent } from 'frogbot';

export const OwnerNote: TextFieldServerComponent = ({ req }) => (
  <div data-testid="owner-note">{Object.keys(req.frogbot.collections).length}</div>
);
