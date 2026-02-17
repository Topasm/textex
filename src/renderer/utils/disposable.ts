// Re-export from shared lifecycle module.
// Existing imports from this path continue to work.
export {
  type IDisposable,
  DisposableStore,
  MutableDisposable,
  toDisposable,
  Emitter
} from '../../shared/lifecycle'
