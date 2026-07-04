// MESAAS: embed-mode session boot — runs from EditorView.onMounted (the canvas
// must be mounted first: openFigFile awaits fitCurrentPageToViewport, which
// blocks until the viewport has a size).
import type { EditorStore } from '@/app/editor/session/create'
import { toast } from '@/app/shell/ui'

import { awaitFirstAuth, bridge, embedClient, embedConfig, exposeDevProbe } from './index'

export async function bootEmbedSession(store: EditorStore): Promise<void> {
  if (!embedConfig || !embedClient) return

  store.state.autosaveEnabled = true
  exposeDevProbe({ editor: store, state: store.state })
  bridge.on('save', () => {
    void store.saveFigFile()
  })

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
    bridge.emit('doc:loaded', { rev })
  } catch (e) {
    toast.error('Não foi possível carregar o design.')
    bridge.emit('save:error', { message: e instanceof Error ? e.message : String(e) })
  }
}
