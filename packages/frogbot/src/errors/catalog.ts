import type { AgentErrorCode, TurnErrorCode } from '@frogbotai/protocol';

import { connectionErrors, runtimeErrors } from './catalogRuntime.js';
import { defineErrors, type ErrorDefinition } from './FrogBotError.js';

const SIGN_IN = 'Sign in, or send an API key in the Authorization header, then retry.';

const requestErrors = {
  internal: {
    status: 500,
    title: 'Something went wrong.',
    hint: 'Retry once. If it fails again, look up this request id in the server log.',
  },
  'request.invalid': {
    status: 400,
    title: 'The request is invalid.',
    hint: 'Fix the fields named in `errors`, then send the request again.',
    exit: 2,
  },
  'request.invalid-json': {
    status: 400,
    title: "The body isn't valid JSON.",
    hint: 'Send a JSON body with `Content-Type: application/json`.',
    exit: 2,
  },
  'request.invalid-query': {
    status: 400,
    title: 'The query is invalid.',
    hint: "Check the query's field names, operators and values against the collection.",
    exit: 2,
  },
  'request.unsupported-media-type': {
    status: 415,
    title: "This endpoint doesn't take that content type.",
    hint: 'Send `application/json`, or the form type the endpoint documents.',
    exit: 2,
  },
  'request.rejected': {
    status: 400,
    title: 'The request was rejected.',
    hint: '`detail` says why. Change the request to match, then retry.',
    exit: 2,
  },
} satisfies Record<string, ErrorDefinition>;

const authErrors = {
  'auth.unauthenticated': {
    status: 401,
    title: 'Sign-in required.',
    hint: SIGN_IN,
    exit: 3,
  },
  'auth.forbidden': {
    status: 403,
    title: 'Not allowed.',
    hint: "The collection's access rules don't allow this for this user. Use an account or API key that has access.",
  },
  'auth.invalid-credentials': {
    status: 401,
    title: 'The email or password is wrong.',
    hint: 'Check the email and password, or reset the password.',
    exit: 3,
  },
  'auth.locked': {
    status: 401,
    title: 'This account is locked.',
    hint: 'Wait for the lock to expire after too many failed sign-ins, or ask an admin to unlock it.',
    exit: 3,
  },
  'auth.unverified-email': {
    status: 403,
    title: "This account's email isn't verified.",
    hint: "Open the verification link sent to the account's email, then sign in.",
    exit: 3,
  },
} satisfies Record<string, ErrorDefinition>;

const docErrors = {
  'route.not-found': {
    status: 404,
    title: 'No API route matches this path.',
    hint: 'Check the method and path against the REST API docs, such as `GET /api/<collection>`.',
  },
  'doc.not-found': {
    status: 404,
    title: 'Not found.',
    hint: 'Check the collection slug and the ID, and that this user can read the document.',
  },
  'doc.locked': {
    status: 423,
    title: 'Someone else is editing this document.',
    hint: 'Wait until the other editor finishes or their lock expires, then retry.',
    retryable: true,
  },
  'upload.missing-file': {
    status: 400,
    title: 'No file was sent.',
    hint: 'Send the file as the `file` field of a multipart form.',
    exit: 2,
  },
  'upload.failed': {
    status: 400,
    title: "The file couldn't be uploaded.",
    hint: "Check the file's type and size against the upload collection's settings.",
  },
  'upload.unreadable': {
    status: 500,
    title: "The file couldn't be read.",
    hint: "Check the storage adapter's settings and credentials in the server log.",
  },
  'upload.delete-failed': {
    status: 500,
    title: "The file couldn't be deleted.",
    hint: "Check the storage adapter's settings and credentials in the server log.",
  },
} satisfies Record<string, ErrorDefinition>;

const agentErrors = {
  'agent.not-found': {
    status: 404,
    title: 'Agent not found.',
    hint: 'List agents with `GET /api/agents`, then use one of their slugs.',
  },
  'agent.access-denied': {
    status: 403,
    title: 'This user may not use this agent.',
    hint: "The agent's `access` function refused this user. Use an account it allows.",
  },
  'agent.access-error': {
    status: 500,
    title: "The agent's access check failed.",
    hint: "Fix the agent's `access` function: it threw instead of returning true or false.",
  },
  'agent.model-not-allowed': {
    status: 403,
    title: "This model isn't allowed here.",
    hint: 'Leave `model` unset, or pick one of the allowed models `detail` lists.',
  },
  'agent.no-model-available': {
    status: 403,
    title: 'No model on this agent is allowed for this user.',
    hint: "Allow one of the agent's models for this user in the app's AI access rules.",
  },
  'agent.reasoning-unavailable': {
    status: 400,
    title: "This reasoning option isn't available for the model.",
    hint: 'Leave `reasoning` unset, or pick one of the options `detail` lists.',
  },
} satisfies Record<Exclude<AgentErrorCode, 'auth.unauthenticated'>, ErrorDefinition>;

const chatErrors = {
  'chat.attachments-off': {
    status: 400,
    title: 'Chat attachments need chat persistence.',
    hint: 'Turn on `chat` in the config, or send the message without files.',
  },
  'chat.file-not-found': {
    status: 404,
    title: 'File not found.',
    hint: "Upload the file to the chat's assets collection, then reference its ID.",
  },
  'chat.file-forbidden': {
    status: 403,
    title: "This user can't read the file.",
    hint: 'Reference a file this user uploaded or may read.',
  },
  'chat.file-unavailable': {
    status: 404,
    title: "The file's contents couldn't be read.",
    hint: 'Upload the file again.',
  },
} satisfies Record<string, ErrorDefinition>;

const turnErrors = {
  'turn.already-settled': {
    status: 409,
    title: 'This tool call is already settled.',
    hint: 'Read `GET /api/agents/<slug>/chats/<chatId>/pending` and settle only the calls still listed.',
  },
  'turn.call-not-found': {
    status: 404,
    title: 'Tool call not found.',
    hint: 'Read `GET /api/agents/<slug>/chats/<chatId>/pending` for the current tool call IDs.',
  },
  'turn.channel-chat': {
    status: 409,
    title: 'This chat belongs to a channel.',
    hint: 'Reply in the channel the chat came from, such as Slack or Teams.',
  },
  'turn.compaction-failed': {
    status: 502,
    title: "The chat couldn't be compacted.",
    hint: 'Retry, or pick another model for compaction.',
    retryable: true,
  },
  'turn.forbidden': {
    status: 403,
    title: "This user can't change this message.",
    hint: 'Only the person who wrote a queued message can edit or remove it.',
  },
  'turn.invalid-output': {
    status: 400,
    title: "The tool output doesn't match the tool.",
    hint: "Send an output that matches the tool's output schema.",
  },
  'turn.not-awaiting': {
    status: 409,
    title: "This chat isn't waiting for input.",
    hint: 'Send a new message instead of settling a call.',
  },
  'turn.not-found': {
    status: 404,
    title: 'Chat or message not found.',
    hint: 'Check the chat ID and message ID, and that the chat belongs to this agent.',
  },
  'turn.not-queued': {
    status: 409,
    title: 'This message is no longer queued.',
    hint: 'It has already been sent. Send a new message instead.',
  },
  'turn.nothing-to-compact': {
    status: 409,
    title: 'There is nothing to compact yet.',
    hint: 'Compact again after the chat has more messages.',
  },
  'turn.pending-calls': {
    status: 409,
    title: 'Tool calls are waiting for input.',
    hint: 'Settle the calls listed by `GET /api/agents/<slug>/chats/<chatId>/pending` first.',
  },
  'turn.selection-unavailable': {
    status: 409,
    title: 'The chosen model or reasoning option is unavailable.',
    hint: "Pick a model or reasoning option from the agent's manifest at `GET /api/agents`.",
  },
  'turn.in-progress': {
    status: 409,
    title: 'A reply is already being written in this chat.',
    hint: "Wait for it to finish, or send with `delivery: 'queue'`.",
    retryable: true,
  },
  'turn.write-conflict': {
    status: 409,
    title: 'The chat changed while saving.',
    hint: 'Retry the request.',
    retryable: true,
  },
} satisfies Record<TurnErrorCode, ErrorDefinition>;

const aiErrors = {
  'ai.access-denied': {
    status: 403,
    title: 'This user may not use this kind of AI call.',
    hint: "The app's `ai.access` rule refused it. Use an account it allows.",
  },
  'ai.context-overflow': {
    status: 400,
    title: 'This chat is too long for the model.',
    hint: 'Compact the chat, start a new one, or pick a model with a larger context window.',
  },
  'ai.key-rejected': {
    status: 502,
    title: 'The AI provider rejected the API key.',
    hint: "Check the provider's API key.",
  },
  'ai.no-credential': {
    status: 401,
    title: 'This AI provider has no usable credential.',
    hint: '`detail` names the key to set or the account to link.',
  },
  'ai.out-of-credit': {
    status: 502,
    title: 'The AI provider account is out of credit.',
    hint: "Add credit or raise the limit in the provider's billing settings.",
  },
  'ai.budget-spent': {
    status: 403,
    title: "This user's monthly AI budget is spent.",
    hint: 'Raise the budget on the user, or wait for spend to reset next month.',
  },
  'ai.rate-limited': {
    status: 429,
    title: 'The AI provider is rate limiting requests.',
    hint: 'Try again shortly, or check your plan and billing.',
    retryable: true,
  },
  'ai.model-unavailable': {
    status: 502,
    title: "The model isn't available from the AI provider.",
    hint: 'Check the model ID and your provider account.',
  },
  'ai.unreachable': {
    status: 502,
    title: "FrogBot couldn't reach the AI provider.",
    hint: 'Check the network connection and try again.',
    retryable: true,
  },
  'ai.provider-down': {
    status: 502,
    title: 'The AI provider is unavailable.',
    hint: 'Try again in a moment.',
    retryable: true,
  },
  'ai.provider-error': {
    status: 502,
    title: 'The AI provider returned an error.',
    hint: 'Check the server log for details.',
  },
  'ai.request-rejected': {
    status: 400,
    title: 'The AI gateway rejected the request.',
    hint: '`detail` says why, and `data.gatewayCode` names the gateway rule.',
  },
} satisfies Record<string, ErrorDefinition>;

const memoryErrors = {
  'memory.invalid': {
    status: 400,
    title: 'The memory request is invalid.',
    hint: 'Fix the input `detail` names, then send it again.',
  },
  'memory.invalid-scope': {
    status: 400,
    title: "This memory scope can't be used here.",
    hint: "Use one of the scope words `detail` lists, such as 'me', 'agent' or 'team'.",
  },
  'memory.duplicate': {
    status: 409,
    title: 'A memory in this scope already says this.',
    hint: 'Update the existing memory instead of saving a new one.',
  },
  'memory.scope-full': {
    status: 409,
    title: 'This memory scope is full.',
    hint: 'Forget a memory in this scope, then save again.',
  },
  'memory.pinned-budget': {
    status: 409,
    title: 'Pinned memories in this scope would exceed their budget.',
    hint: 'Unpin a memory in this scope, or save this one without `pinned`.',
  },
  'memory.not-found': {
    status: 404,
    title: 'Memory not found.',
    hint: 'List or search memories in this scope to get a current ID.',
  },
  'memory.unavailable': {
    status: 503,
    title: 'Memory is unavailable right now.',
    hint: "Retry later. If it keeps failing, check the embedding model's provider.",
    retryable: true,
  },
} satisfies Record<string, ErrorDefinition>;

const searchErrors = {
  'search.invalid': {
    status: 400,
    title: 'The search request is invalid.',
    hint: 'Fix the input `detail` names, then search again.',
  },
  'search.filter-unsupported': {
    status: 400,
    title: "This filter can't be used with this search.",
    hint: 'Remove the filter, or filter on a field the search index stores.',
  },
  'search.not-ready': {
    status: 503,
    title: 'The search index is still being built.',
    hint: 'Try again in a moment.',
    retryable: true,
  },
  'search.engine-gap': {
    status: 501,
    title: "The database engine can't run this search.",
    hint: 'Use a database adapter that supports this search mode, or change the index.',
  },
  'search.not-implemented': {
    status: 501,
    title: "This database adapter doesn't implement this search.",
    hint: 'Use a database adapter that supports this search mode.',
  },
  'search.missing-prerequisite': {
    status: 501,
    title: 'The database is missing something this search needs.',
    hint: 'Install what `detail` names, such as a database extension, then restart.',
  },
  'search.permission-denied': {
    status: 501,
    title: "The database user can't set up this search.",
    hint: 'Grant the database user the permission `detail` names, or set up the index by hand.',
  },
  'search.setup-failed': {
    status: 501,
    title: "The search index couldn't be set up.",
    hint: 'Read `detail` and the server log, fix the cause, then restart.',
  },
  'aggregate.invalid': {
    status: 400,
    title: 'The aggregate request is invalid.',
    hint: 'Fix the input `detail` names, then run it again.',
  },
  'aggregate.unsupported': {
    status: 501,
    title: "This database adapter can't aggregate.",
    hint: 'Use a database adapter that implements aggregate.',
  },
} satisfies Record<string, ErrorDefinition>;

/**
 * Raises one of core's error codes: `throw frogbotError('memory.scope-full', { detail })`. Every
 * code is listed at https://docs.frogbot.ai/errors.
 */
export const frogbotError = defineErrors({
  ...requestErrors,
  ...authErrors,
  ...docErrors,
  ...agentErrors,
  ...chatErrors,
  ...turnErrors,
  ...aiErrors,
  ...memoryErrors,
  ...searchErrors,
  ...connectionErrors,
  ...runtimeErrors,
});

/** Every error code core raises. */
export type FrogBotErrorCode = Parameters<typeof frogbotError>[0];

/** The codes a memory adapter throws, such as `memory.not-found`. */
export type MemoryErrorCode = Extract<FrogBotErrorCode, `memory.${string}`>;
