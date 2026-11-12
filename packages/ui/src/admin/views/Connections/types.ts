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
  /** Whether a user can link several OAuth accounts; false when the recipe can't tell them apart. */
  oauthAccounts?: boolean;
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
  /** Whether calls that pin no account use this one. */
  isDefault?: boolean;
  status: 'active' | 'revoked' | 'error';
  scopes?: string[];
  expiresAt?: string | null;
};

export type ConnectionsViewClientProps = {
  apiPath: string;
  returnTo: string;
  pieces: ConnectionPiece[];
  initialConnections: ConnectionItem[];
  initialError?: string;
};
