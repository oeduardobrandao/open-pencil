// MESAAS: postMessage bridge v1 between the embedded editor and the host (CRM shell).
// Every message is { v: 1, type, ...payload }. Inbound messages are accepted ONLY
// from the configured parent origin; outbound messages are posted to that origin.
// Protocol reference: sm-crm docs/estudio-v2-editor-contract.md

type BridgeMessage = Record<string, unknown>
type Handler = (msg: BridgeMessage) => void

export type Bridge = {
  emit: (type: string, payload?: BridgeMessage) => void
  on: (type: string, fn: Handler) => void
  handleMessage: (e: MessageEvent) => void
}

export function createBridge(parentOrigin: string, parent: Window): Bridge {
  const handlers = new Map<string, Handler[]>()

  function emit(type: string, payload: BridgeMessage = {}) {
    parent.postMessage({ v: 1, type, ...payload }, parentOrigin)
  }

  function on(type: string, fn: Handler) {
    handlers.set(type, [...(handlers.get(type) ?? []), fn])
  }

  function handleMessage(e: MessageEvent) {
    if (e.origin !== parentOrigin) return
    const d = e.data as { v?: number; type?: string } | null
    if (!d || d.v !== 1 || !d.type) return
    for (const fn of handlers.get(d.type) ?? []) fn(d as BridgeMessage)
  }

  return { emit, on, handleMessage }
}

/** No-op bridge for standalone (non-embedded) mode so call sites never branch. */
export function createNoopBridge(): Bridge {
  const noop = () => {
    /* standalone mode: bridge disabled */
  }
  return { emit: noop, on: noop, handleMessage: noop }
}
