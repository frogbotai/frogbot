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
  secretSchema?: ConnectionField;
};

export type ConnectionItem = {
  id: number | string;
  piece: string;
  method: 'oauth' | 'secret';
  account?: { label: string; email?: string } | null;
  status: 'active' | 'revoked' | 'error';
  expiresAt?: string | null;
};

export type ConnectionsViewClientProps = {
  apiPath: string;
  returnTo: string;
  pieces: ConnectionPiece[];
  initialConnections: ConnectionItem[];
  initialError?: string;
};
