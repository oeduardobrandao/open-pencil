// MESAAS: embed-mode session boot — runs from EditorView.onMounted (the canvas
// must be mounted first: openFigFile awaits fitCurrentPageToViewport, which
// blocks until the viewport has a size).
import type { EditorStore } from '@/app/editor/session/create'
import { toast } from '@/app/shell/ui'

import { awaitFirstAuth, bridge, embedClient, embedConfig, exposeDevProbe } from './index'

export async function bootEmbedSession(store: EditorStore): Promise<void> {
  if (!embedConfig || !embedClient) return

  // readOnly: no autosave, `save` bridge messages ignored, pan-only pointer (HAND tool —
  // EditorView also hides the toolbar and skips keyboard bindings, and the capture
  // listeners below neutralize dblclick text-edit and the right-click selection menu).
  store.state.autosaveEnabled = !embedConfig.readOnly
  exposeDevProbe({ editor: store, state: store.state })
  if (!embedConfig.readOnly) {
    bridge.on('save', () => {
      void store.saveFigFile()
    })
  } else {
    for (const type of ['dblclick', 'contextmenu'] as const) {
      window.addEventListener(
        type,
        (e) => {
          e.preventDefault()
          e.stopPropagation()
        },
        { capture: true }
      )
    }
  }

  try {
    bridge.emit('ready')
    await awaitFirstAuth()
    const { file, rev } = await embedClient.fetchDocument()
    await store.openFigFile(file)
    const contentPage = store.graph.getPages().find((p) => p.childIds.length > 0)
    if (contentPage) {
      store.state.currentPageId = contentPage.id
      await store.fitCurrentPageToViewport()
    }
    if (embedConfig.readOnly) store.setTool('HAND')
    bridge.emit('doc:loaded', { rev })
  } catch (e) {
    toast.error('Não foi possível carregar o design.')
    bridge.emit('save:error', { message: e instanceof Error ? e.message : String(e) })
  }
}
