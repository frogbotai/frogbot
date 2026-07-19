// FrogBot's per-collection auth configuration.
// v0 exposes only Payload's plain options. FrogBot extensions
// (`providers`, `allowedDomains`, `allowSignup`) land in a later stage.

export interface AuthConfig {
  tokenExpiration?: number;
  verify?: boolean | { generateEmailHTML?: (args: { token: string; user: unknown }) => string | Promise<string> };
  maxLoginAttempts?: number;
  lockTime?: number;
  loginWithUsername?: boolean | { allowEmailLogin?: boolean; requireEmail?: boolean; requireUsername?: boolean };
  cookies?: {
    secure?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
    domain?: string;
  };
  useSessions?: boolean;
}
