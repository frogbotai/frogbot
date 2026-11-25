import type { ErrorDefinition } from './FrogBotError.js';

const LINKED_ACCOUNTS = 'Link or reconnect the account in Settings → Linked accounts, then retry.';

export const connectionErrors = {
  'connection.not-found': {
    status: 404,
    title: 'Connection not found.',
    hint: "Check the piece slug or connection ID against the app's `connections` config.",
  },
  'connection.not-configured': {
    status: 409,
    title: 'No `connections` entry declares this piece.',
    hint: 'Add the piece to the root `connections` config with `secret: true` or `oauth`.',
  },
  'connection.not-linked': {
    status: 409,
    title: "This account isn't linked.",
    hint: LINKED_ACCOUNTS,
  },
  'connection.revoked': {
    status: 409,
    title: 'This linked account was revoked.',
    hint: LINKED_ACCOUNTS,
  },
  'connection.expired': {
    status: 409,
    title: "This linked account's sign-in expired.",
    hint: LINKED_ACCOUNTS,
  },
  'connection.missing-scopes': {
    status: 403,
    title: "This linked account didn't grant every permission needed.",
    hint: 'Reconnect it in Settings → Linked accounts and grant the scopes in `data.missingScopes`.',
  },
  'connection.ambiguous': {
    status: 409,
    title: 'Several accounts are linked and none is the default.',
    hint: 'Choose a default account in Settings → Linked accounts, or pass `connection`.',
  },
  'connection.forbidden': {
    status: 403,
    title: "This connection isn't one of this user's accounts.",
    hint: "Pass the ID of one of this user's linked accounts, or leave `connection` unset.",
  },
  'connection.unreadable': {
    status: 500,
    title: "The linked account couldn't be read.",
    hint: 'Check the server log. If the credential key changed, reconnect the account.',
  },
  'connection.busy': {
    status: 409,
    title: 'This connection is being changed.',
    hint: 'Retry in a moment.',
    retryable: true,
  },
  'connection.save-failed': {
    status: 500,
    title: "The connection couldn't be saved.",
    hint: 'Check the server log for the cause.',
  },
  'connection.no-credentials': {
    status: 400,
    title: 'This piece takes no key.',
    hint: 'Link it with OAuth, or remove the request.',
  },
  'connection.invalid-credentials': {
    status: 400,
    title: 'The credentials are invalid.',
    hint: "Fix the fields named in `errors`, matching the piece's auth schema.",
  },
  'connection.key-rejected': {
    status: 422,
    title: "The service didn't accept this key.",
    hint: 'Check the key with the service, then link it again.',
  },
  'connection.unreachable': {
    status: 502,
    title: "FrogBot couldn't reach the service to check the key.",
    hint: 'Retry in a moment.',
    retryable: true,
  },
  'oauth.state': {
    status: 400,
    title: 'This sign-in expired or was already used.',
    hint: 'Start the sign-in again.',
  },
  'oauth.configuration': {
    status: 500,
    title: 'The OAuth setup is incomplete.',
    hint: "Check the provider's client ID, secret and redirect URL in the server log.",
  },
  'oauth.tokens': {
    status: 400,
    title: "The sign-in couldn't be finished.",
    hint: 'Start the sign-in again.',
  },
  'oauth.account': {
    status: 400,
    title: "The provider's account couldn't be used.",
    hint: 'Sign in with another account, or check `detail`.',
  },
  'oauth.refresh': {
    status: 409,
    title: "The linked account's sign-in couldn't be renewed.",
    hint: LINKED_ACCOUNTS,
  },
  'oauth.sign-up': {
    status: 403,
    title: "This app doesn't allow new accounts from this sign-in.",
    hint: 'Sign in with an existing account, or ask an admin to invite you.',
  },
} satisfies Record<string, ErrorDefinition>;

export const runtimeErrors = {
  'job.waitpoint-not-found': {
    status: 404,
    title: 'This waitpoint was not found.',
    hint: 'Check the resume link; it may belong to a job that was deleted.',
  },
  'job.waitpoint-consumed': {
    status: 409,
    title: 'This waitpoint was already resumed.',
    hint: 'Nothing to do: the job has continued.',
  },
  'job.waitpoint-expired': {
    status: 410,
    title: 'This waitpoint has expired.',
    hint: 'Start the job again to get a new resume link.',
  },
  'kv.unsupported': {
    status: 501,
    title: "This KV adapter can't coordinate or expire keys.",
    hint: 'Use a KV adapter with atomic operations, such as the database or Redis adapter.',
  },
  'kv.lock-held': {
    status: 409,
    title: 'Another request holds this lock.',
    hint: 'Retry in a moment.',
    retryable: true,
  },
  'kv.lease-lost': {
    status: 409,
    title: 'The lock expired before the work finished.',
    hint: 'Retry the request.',
    retryable: true,
  },
} satisfies Record<string, ErrorDefinition>;
