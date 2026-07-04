// MESAAS: embed-mode document client — pure module, no window access.
// Speaks the frozen HTTP contract (see sm-crm docs/estudio-v2-editor-contract.md):
// GET  {docUrl}                      → 200 bytes + x-rev | 401 | 403 | 404
// PUT  {docUrl} + x-expected-rev     → 200 + x-rev | 409 | 401 | 403 | 413 | 422

export class EmbedConflictError extends Error {
  override name = 'EmbedConflictError'
}
export class EmbedAuthError extends Error {
  override name = 'EmbedAuthError'
}

export type EmbedConfig = { docUrl: string; parentOrigin: string | null }

/** Injectable fetch shape — narrow on purpose so tests can pass plain mocks. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export function createEmbedClient(cfg: EmbedConfig, fetchImpl: FetchLike = fetch) {
  let rev: number | null = null
  let token: string | null = null
  let suspended = false

  function authHeaders(): Record<string, string> {
    return token ? { authorization: `Bearer ${token}` } : {}
  }

  async function fetchDocument(): Promise<{ file: File; rev: number }> {
    const res = await fetchImpl(cfg.docUrl, { headers: authHeaders() })
    if (res.status === 401) throw new EmbedAuthError('unauthorized')
    if (!res.ok) throw new Error(`doc fetch failed: ${res.status}`)
    rev = Number(res.headers.get('x-rev') ?? '0')
    const bytes = await res.arrayBuffer()
    return {
      file: new File([bytes], 'embedded.fig', { type: 'application/octet-stream' }),
      rev
    }
  }

  async function saveDocument(bytes: Uint8Array): Promise<number> {
    if (suspended) throw new Error('saving suspended after conflict — reload the document')
    const res = await fetchImpl(cfg.docUrl, {
      method: 'PUT',
      headers: {
        ...authHeaders(),
        'content-type': 'application/octet-stream',
        ...(rev !== null ? { 'x-expected-rev': String(rev) } : {})
      },
      body: new Blob([bytes.buffer as ArrayBuffer])
    })
    if (res.status === 409) {
      suspended = true
      throw new EmbedConflictError('stale rev')
    }
    if (res.status === 401) throw new EmbedAuthError('unauthorized')
    if (!res.ok) throw new Error(`save failed: ${res.status}`)
    rev = Number(res.headers.get('x-rev') ?? String((rev ?? 0) + 1))
    return rev
  }

  return {
    fetchDocument,
    saveDocument,
    setAccessToken: (t: string) => {
      token = t
    },
    isSaveSuspended: () => suspended,
    currentRev: () => rev
  }
}

export type EmbedClient = ReturnType<typeof createEmbedClient>
