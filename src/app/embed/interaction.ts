// MESAAS: embed-editable "first save = first user edit" gate.
//
// Compose-built docs (image → editable design import) contain TEXT nodes never shaped
// by the editor. Opening the doc re-measures/re-lays-out text (and may normalize other
// fields, e.g. legacy clipsContent) — that alone dirties sceneVersion and, left
// unguarded, the regular debounced autosave persists it within seconds of load, with
// ZERO user interaction. On the Mesaas side the design is created attached to a post but
// HELD (media_apply_held) until the user's first save confirms fidelity; an autosave
// that fires before any real edit clears that hold prematurely and replaces the post
// media before anyone looked at the design.
//
// Fix: latch "has the user touched this session" on the first pointerdown/keydown
// (capture phase, matches the dblclick/contextmenu neutralizers in boot.ts) and gate
// autosave on it until it flips. Boot-time mutations still ride along on the autosave
// that follows the user's first genuine edit — they are not lost, only deferred.
// Manual `save` bridge messages are untouched (wired directly in boot.ts, not through
// this latch) and readOnly sessions never install the listener (autosave is already
// off there).

/** Injectable listener target — narrow so tests can pass plain doubles (see bridge.ts's
 * ParentWindow for the same pattern), no DOM and no `Window` cast required. */
export type InteractionTarget = {
  addEventListener: (type: string, fn: (e: unknown) => void, options: AddEventListenerOptions) => void
  removeEventListener: (type: string, fn: (e: unknown) => void, options: AddEventListenerOptions) => void
}

let interacted = false

/** Test-only: reset the latch between unit tests (module-level state). */
export function resetUserInteraction(): void {
  interacted = false
}

export function hasUserInteracted(): boolean {
  return interacted
}

function markInteracted(): void {
  interacted = true
}

/** Call once per embed-editable session boot. Idempotent listeners (capture phase). */
export function watchForFirstUserInteraction(target: InteractionTarget): () => void {
  const options: AddEventListenerOptions = { capture: true }
  target.addEventListener('pointerdown', markInteracted, options)
  target.addEventListener('keydown', markInteracted, options)
  return () => {
    target.removeEventListener('pointerdown', markInteracted, options)
    target.removeEventListener('keydown', markInteracted, options)
  }
}
