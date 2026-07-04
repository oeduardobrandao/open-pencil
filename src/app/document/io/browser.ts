import type { ViewportSize } from '@/app/document/io/types'

export function yieldToUI(): Promise<void> {
  // MESAAS: rAF never fires in render-throttled (e.g. cross-origin / backgrounded)
  // iframes, which stalled document open forever. Race it with a short timeout —
  // still yields, but never blocks correctness on paint scheduling.
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(), 100)
    requestAnimationFrame(() => {
      clearTimeout(timer)
      resolve()
    })
  })
}

type ViewportEditor = {
  zoomToFit: () => void
}

export function createDocumentViewportActions(editor: ViewportEditor, viewportSize: ViewportSize) {
  function setViewportSize(width: number, height: number) {
    viewportSize.width = width
    viewportSize.height = height
  }

  async function fitCurrentPageToViewport() {
    await yieldToUI()
    editor.zoomToFit()
  }

  return { setViewportSize, fitCurrentPageToViewport }
}

export function downloadBlob(data: Uint8Array, filename: string, mime: string) {
  const blob = new Blob([data.buffer as ArrayBuffer], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 100)
}
