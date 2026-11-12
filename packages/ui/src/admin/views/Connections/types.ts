export type ConnectionField = {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
  title?: string;
  description?: string;
  nullable?: boolean;
  choices?: (string | number | boolean)[];
  properties?: Record<string, ConnectionField>;
  required?: string[];
  items?: ConnectionField;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
};

export type ConnectionPiece = {
  slug: string;
  label: string;
  oauth: boolean;
  secret: boolean;
  scopes?: string[];
  /** Names the OAuth method, in place of "OAuth". */
  oauthLabel?: string;
  icon?: string;
  secretSchema?: ConnectionField;
};

export type ConnectionItem = {
  id: number | string;
  piece: string;
  method: 'oauth' | 'secret';
  account?: { label: string; email?: string } | null;
  status: 'active' | 'revoked' | 'error';
  scopes?: string[];
  expiresAt?: string | null;
};

/** A shared account the config declares with `app`, and its linked row when there is one. */
export type ConnectionSlot = {
  app: string;
  piece: ConnectionPiece;
  connection?: ConnectionItem;
};

export type ConnectionsViewClientProps = {
  apiPath: string;
  returnTo: string;
  pieces: ConnectionPiece[];
  initialConnections: ConnectionItem[];
  initialError?: string;
  /** App slots, shown only when the config declares some. */
  slots?: ConnectionSlot[];
};
