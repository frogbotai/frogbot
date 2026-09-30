import type { FrogBot } from 'frogbot';

export const hookOrderSlug = 'hook-order';
export const reqAccessSlug = 'req-access';
export const accessBooleanSlug = 'access-boolean';
export const accessWhereSlug = 'access-where';
export const fieldAccessSlug = 'field-access';
export const validateSlug = 'validate-ctx';
export const afterOpSlug = 'after-operation';
export const contextFlowSlug = 'context-flow';
export const overrideAccessSlug = 'override-access';
export const usersSlug = 'users';

export const testUserEmail = 'hook-test@frogbot.local';
export const testUserPassword = 'test-password-123';

export const afterMeResponseHeader = 'x-test-after-me-response';
export const afterMeResponse = { user: null, exp: 177 };
export const afterErrorStatusHeader = 'x-test-after-error-status';
export const beforeOperationTitleHeader = 'x-test-before-operation-title';
export const authRequestIdentityHeader = 'x-test-auth-request-identity';

export type AuthRequestState = {
  frogbot: FrogBot;
  payload: object;
};

export type AuthRequestIdentityLogEntry = {
  beforeOperation: AuthRequestState | undefined;
  afterMe: AuthRequestState;
};

export type AuthHookLogEntry = {
  phase: 'afterMe' | 'afterLogout' | 'afterError';
  frogbot: string;
};
