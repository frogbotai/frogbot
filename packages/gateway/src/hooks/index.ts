// Public hook surface for the `@frogbotai/gateway` package (`./hooks` subpath).
//
// Hook lifecycle types for consumers writing typed hooks (Scenario C), plus
// `mergeHooks` for composing multiple hook sets.

export type {
  AfterErrorHook,
  AfterErrorHookArgs,
  AfterOperationHook,
  AfterOperationHookArgs,
  AfterUpstreamHook,
  AfterUpstreamHookArgs,
  BeforeOperationHook,
  BeforeOperationHookArgs,
  BeforeUpstreamHook,
  BeforeUpstreamHookArgs,
  HookOperation,
  HookPhase,
  Hooks,
  HookUsage,
  LanguageParams,
  OperationBase,
} from '../hooks.js';
export { mergeHooks } from '../providers/middleware.js';
