import type { Editor, EditorState } from '@open-pencil/core/editor'
import { exportFigFile } from '@open-pencil/core/io/formats/fig'

import { watchDebounced } from '@vueuse/core'

import { createAutosave } from '@/app/document/autosave'
import { EmbedAuthError, EmbedConflictError, bridge, embedClient, embedConfig } from '@/app/embed'
import { toast } from '@/app/shell/ui'
import {
  documentNameFromFigPath,
  downloadNameFromPath,
  figDownloadName
} from '@/app/document/io/names'
import { createSaveActions } from '@/app/document/io/save'
import { createDocumentSourceState } from '@/app/document/io/source-state'

type DocumentSourceState = EditorState & {
  documentName: string
  autosaveEnabled: boolean
}

export { createDocumentSourceState }

type DocumentSourceOptions = {
  editor: Editor
  state: DocumentSourceState
  stopWatchingFile: () => void
  startWatchingFile: () => Promise<void>
  getFileHandle: () => FileSystemFileHandle | null
  setFileHandle: (handle: FileSystemFileHandle | null) => void
  getFilePath: () => string | null
  setFilePath: (path: string | null) => void
  getDownloadName: () => string | null
  setDownloadName: (name: string | null) => void
  getSavedVersion: () => number
  setSavedVersion: (version: number) => void
  setLastWriteTime: (time: number) => void
  getRenderer: () => Editor['renderer']
}

export function createDocumentSourceActions({
  editor,
  state,
  stopWatchingFile,
  startWatchingFile,
  getFileHandle,
  setFileHandle,
  getFilePath,
  setFilePath,
  getDownloadName,
  setDownloadName,
  getSavedVersion,
  setSavedVersion,
  setLastWriteTime,
  getRenderer
}: DocumentSourceOptions) {
  function buildFigFile() {
    return exportFigFile(editor.graph, undefined, getRenderer() ?? undefined, state.currentPageId)
  }

  const { saveFigFile, saveFigFileAs, writeFile } = createSaveActions({
    state,
    buildFigFile,
    getFilePath,
    setFilePath,
    getFileHandle,
    setFileHandle,
    getDownloadName,
    setDownloadName,
    setSavedVersion,
    setLastWriteTime,
    startWatchingFile: () => {
      void startWatchingFile()
    }
  })

  // MESAAS: HTTP-backed document source — save through the embed client,
  // surface every outcome on the bridge (contract: estudio-v2-editor-contract.md).
  async function saveToEmbed() {
    if (!embedClient) return
    const versionAtBuild = state.sceneVersion
    try {
      const bytes = await buildFigFile()
      const rev = await embedClient.saveDocument(bytes)
      setSavedVersion(versionAtBuild)
      bridge.emit('save:ok', { rev, bytes: bytes.length })
      bridge.emit('dirty', { dirty: state.sceneVersion !== versionAtBuild })
    } catch (e) {
      if (e instanceof EmbedConflictError) {
        toast.error('Este design foi alterado em outro lugar. Recarregue para continuar.')
        bridge.emit('save:conflict', { rev: embedClient?.currentRev() ?? null })
      } else if (e instanceof EmbedAuthError) {
        bridge.emit('auth:needed')
      } else {
        toast.error('Falha ao salvar o design.')
        bridge.emit('save:error', { message: e instanceof Error ? e.message : String(e) })
      }
      throw e
    }
  }

  // MESAAS: dirty signal for the host shell (sceneVersion drifts from savedVersion)
  if (embedConfig) {
    watchDebounced(
      () => state.sceneVersion,
      (version) => {
        if (version !== getSavedVersion()) bridge.emit('dirty', { dirty: true })
      },
      { debounce: 300 }
    )
  }

  const { disposeAutosave } = createAutosave({
    state,
    getSavedVersion,
    hasWritableSource: () => !!embedConfig || !!getFileHandle() || !!getFilePath(),
    saveCurrentDocument: async () =>
      embedConfig ? saveToEmbed() : writeFile(await buildFigFile())
  })

  function setDocumentSource(
    fileName: string,
    sourceFormat: string,
    handle?: FileSystemFileHandle,
    path?: string
  ) {
    stopWatchingFile()
    const isFig = sourceFormat === 'fig'
    setFileHandle(isFig ? (handle ?? null) : null)
    setFilePath(isFig ? (path ?? null) : null)
    setDownloadName(figDownloadName(fileName, sourceFormat))
    setSavedVersion(state.sceneVersion)
    if (isFig && (handle || path)) {
      void startWatchingFile()
    }
  }

  function setPlannedFilePath(path: string) {
    stopWatchingFile()
    setFileHandle(null)
    setFilePath(path)
    const downloadName = downloadNameFromPath(path)
    setDownloadName(downloadName)
    state.documentName = documentNameFromFigPath(downloadName)
  }

  function startWatchingCurrentFile() {
    void startWatchingFile()
  }

  function disposeDocumentIO() {
    stopWatchingFile()
    disposeAutosave()
  }

  return {
    setDocumentSource,
    setPlannedFilePath,
    startWatchingCurrentFile,
    disposeDocumentIO,
    saveFigFile: embedConfig ? saveToEmbed : saveFigFile,
    saveFigFileAs
  }
}
