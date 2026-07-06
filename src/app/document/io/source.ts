import type { Editor, EditorState } from '@open-pencil/core/editor'
import { exportFigFile } from '@open-pencil/core/io/formats/fig'

import { watchDebounced } from '@vueuse/core'

import { createAutosave } from '@/app/document/autosave'
import { EmbedAuthError, EmbedConflictError, bridge, embedClient, embedConfig } from '@/app/embed'
import { hasUserInteracted } from '@/app/embed/interaction'
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
    // readOnly embed never writes — belt on top of the disabled autosave/save handler
    // (the backend would refuse with 403 read_only anyway).
    if (embedConfig?.readOnly) return
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
        bridge.emit('save:conflict', { rev: embedClient.currentRev() })
      } else if (e instanceof EmbedAuthError) {
        bridge.emit('auth:needed')
      } else {
        toast.error('Falha ao salvar o design.')
        bridge.emit('save:error', { message: e instanceof Error ? e.message : String(e) })
      }
      throw e
    }
  }

  // MESAAS: dirty signal for the host shell (sceneVersion drifts from savedVersion).
  // Never emitted in readOnly — nothing can be saved, so nothing is ever "pending".
  if (embedConfig && !embedConfig.readOnly) {
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
      embedConfig ? saveToEmbed() : writeFile(await buildFigFile()),
    // MESAAS: embed-editable only — "first save = first user edit". Compose-built docs
    // (image → editable design import) get re-measured/normalized on open, which alone
    // dirties sceneVersion; without this gate that boot-time mutation autosaves within
    // seconds with zero user input, clearing the server-side media_apply_held hold
    // before anyone looked at the design. readOnly never reaches here (autosave is off
    // via state.autosaveEnabled already); desktop/non-embed has no embedConfig, so the
    // gate is a no-op true for them.
    canAutosave: () => !embedConfig || embedConfig.readOnly || hasUserInteracted()
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
