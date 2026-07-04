import { computed } from 'vue'

import type { Editor } from '@open-pencil/core/editor'
import type { IORegistry } from '@open-pencil/core/io'
import type { SceneGraph } from '@open-pencil/core/scene-graph'

import { createDocumentExportActions } from '@/app/document/export'
import { createDocumentIOActions } from '@/app/document/io'
import { awaitFirstAuth, bridge, embedClient, embedConfig, exposeDevProbe } from '@/app/embed'
import { toast } from '@/app/shell/ui'
import type { ViewportSize } from '@/app/document/io/types'
import { createFlashActions } from '@/app/editor/flash'
import { createMobileClipboardActions } from '@/app/editor/mobile-clipboard'
import { createPenActions } from '@/app/editor/pen'
import { createProfilerActions } from '@/app/editor/profiler'
import type { AppEditorState } from '@/app/editor/session/types'
import { createVectorEditActions } from '@/app/editor/vector-edit'

export function defineEditorStoreAccessors(store: object, editor: Editor) {
  Object.defineProperties(store, {
    graph: {
      enumerable: true,
      get: () => editor.graph
    },
    renderer: {
      enumerable: true,
      get: () => editor.renderer
    },
    textEditor: {
      enumerable: true,
      get: () => editor.textEditor
    }
  })
}

export function createEditorComputedRefs(editor: Editor, state: AppEditorState) {
  const selectedNodes = computed(() => {
    void state.sceneVersion
    return editor.getSelectedNodes()
  })

  const selectedNode = computed(() =>
    selectedNodes.value.length === 1 ? selectedNodes.value[0] : undefined
  )

  const layerTree = computed(() => {
    void state.sceneVersion
    return editor.getLayerTree()
  })

  return { selectedNodes, selectedNode, layerTree }
}

export function createEditorStoreModules(
  editor: Editor,
  graph: SceneGraph,
  state: AppEditorState,
  io: IORegistry,
  viewportSize: ViewportSize
) {
  const flash = createFlashActions(editor, state)
  const pen = createPenActions(editor, graph, state)
  const vectorEdit = createVectorEditActions(editor, graph, state)
  const documentIO = createDocumentIOActions(editor, state, viewportSize)
  // MESAAS: embed boot — announce ready, wait for the parent's auth, load the
  // HTTP-backed document, focus the content page, report doc:loaded.
  if (embedConfig && embedClient) {
    state.autosaveEnabled = true
    exposeDevProbe({ editor, state })
    bridge.on('save', () => {
      void documentIO.saveFigFile()
    })
    void (async () => {
      try {
        bridge.emit('ready')
        await awaitFirstAuth()
        const { file, rev } = await embedClient.fetchDocument()
        await documentIO.openFigFile(file)
        const contentPage = editor.graph.getPages().find((p) => p.childIds.length > 0)
        if (contentPage) {
          state.currentPageId = contentPage.id
          await documentIO.fitCurrentPageToViewport()
        }
        bridge.emit('doc:loaded', { rev })
      } catch (e) {
        toast.error('Não foi possível carregar o design.')
        bridge.emit('save:error', { message: e instanceof Error ? e.message : String(e) })
      }
    })()
  }
  const documentExport = createDocumentExportActions(editor, state, io, documentIO.downloadBlob)
  const mobileClipboard = createMobileClipboardActions(editor, state)
  const profiler = createProfilerActions(editor)

  return {
    ...flash,
    ...pen,
    ...vectorEdit,
    openFigFile: documentIO.openFigFile,
    setViewportSize: documentIO.setViewportSize,
    fitCurrentPageToViewport: documentIO.fitCurrentPageToViewport,
    saveFigFile: documentIO.saveFigFile,
    saveFigFileAs: documentIO.saveFigFileAs,
    setDocumentSource: documentIO.setDocumentSource,
    setPlannedFilePath: documentIO.setPlannedFilePath,
    startWatchingCurrentFile: documentIO.startWatchingCurrentFile,
    dispose: documentIO.disposeDocumentIO,
    ...documentExport,
    ...mobileClipboard,
    ...profiler
  }
}
