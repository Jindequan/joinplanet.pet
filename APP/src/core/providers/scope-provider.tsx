/** Re-export canonical scope provider from core/scope. */
export {
  ScopeProvider,
  useScope,
  scopeLabel,
  scopeStorageKey,
  scopeFilterNeeded,
  type Scope,
} from '../scope/scope-provider'
export { resolvePetTimezone, useResolvedScope, type ResolvedScope } from '../scope/resolved-scope'
