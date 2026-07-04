// MESAAS: embed mode — the app runs inside the Mesaas CRM iframe and loads/saves
// its document over HTTP instead of local files.
// URL shape: /?embed=1&docUrl=<endpoint>&parentOrigin=<host origin>
// Contracts (HTTP + bridge): sm-crm docs/estudio-v2-editor-contract.md

import { type Bridge, createBridge, createNoopBridge } from './bridge'

declare global {
  interface Window {
    /** MESAAS: dev-only probe handle for the embed browser loop. */
    __opSession?: unknown
  }
}
import { type EmbedClient, createEmbedClient } from './client'

export { EmbedAuthError, EmbedConflictError } from './client'

const params = new URLSearchParams(window.location.search)
const docUrl = params.get('docUrl')

export const embedConfig =
  params.get('embed') === '1' && docUrl
    ? { docUrl, parentOrigin: params.get('parentOrigin') }
    : null

export const embedClient: EmbedClient | null = embedConfig
  ? createEmbedClient(embedConfig)
  : null

export const bridge: Bridge = (() => {
  if (!embedConfig?.parentOrigin || window.parent === window) return createNoopBridge()
  const b = createBridge(embedConfig.parentOrigin, window.parent)
  window.addEventListener('message', b.handleMessage)
  return b
})()

// Auth handshake: the editor announces `ready` and waits for the parent's
// `auth { accessToken }` before touching the network. Later `auth` messages
// refresh the token (client keeps it in memory only).
let authResolve: (() => void) | null = null
const firstAuth = new Promise<void>((resolve) => {
  authResolve = resolve
})
bridge.on('auth', (m) => {
  const token = (m as { accessToken?: string }).accessToken
  if (typeof token === 'string' && token) {
    embedClient?.setAccessToken(token)
    authResolve?.()
    authResolve = null
  }
})

export async function awaitFirstAuth(timeoutMs = 5000): Promise<void> {
  if (!embedConfig?.parentOrigin) return // standalone dev: no auth required
  await Promise.race([
    firstAuth,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('embed auth handshake timed out')), timeoutMs)
    })
  ])
}

/** Dev-only: expose a probe handle for the embed browser verification loop. */
export function exposeDevProbe(session: unknown) {
  if (import.meta.env.DEV) window.__opSession = session
}
