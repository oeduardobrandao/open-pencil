import { watchDebounced } from '@vueuse/core'

import type { EditorState } from '@open-pencil/core/editor'

type AutosaveState = EditorState & { autosaveEnabled: boolean }

type AutosaveOptions = {
  state: AutosaveState
  getSavedVersion: () => number
  hasWritableSource: () => boolean
  saveCurrentDocument: () => Promise<void>
  // MESAAS: embed-editable suppresses autosave until the user's first real interaction
  // (see src/app/embed/interaction.ts — "first save = first user edit"). Optional so
  // desktop/Tauri and non-embed web keep the exact prior behavior; defaults to always-on.
  canAutosave?: () => boolean
}

export function createAutosave({
  state,
  getSavedVersion,
  hasWritableSource,
  saveCurrentDocument,
  canAutosave = () => true
}: AutosaveOptions) {
  const stop = watchDebounced(
    () => state.sceneVersion,
    async (version) => {
      if (version === getSavedVersion()) return
      if (!state.autosaveEnabled) return
      if (!hasWritableSource()) return
      if (!canAutosave()) return
      try {
        await saveCurrentDocument()
      } catch (e) {
        console.warn('Autosave failed:', e)
      }
    },
    { debounce: 3000 }
  )

  return { disposeAutosave: stop }
}
