// Public hook surface for the `@frogbotai/gateway` package (`./hooks` subpath).
//
// Hook lifecycle types for consumers writing typed hooks (Scenario C), plus
// `mergeHooks` for composing multiple hook sets.

export type {
  Hooks,
  HookOperation,
  HookPhase,
  HookUsage,
  LanguageParams,
  OperationBase,
  BeforeOperationHookArgs,
  BeforeOperationHook,
  BeforeUpstreamHookArgs,
  BeforeUpstreamHook,
  AfterUpstreamHookArgs,
  AfterUpstreamHook,
  AfterErrorHookArgs,
  AfterErrorHook,
  AfterOperationHookArgs,
  AfterOperationHook,
} from '../hooks.js';

export { mergeHooks } from '../providers/middleware.js';
