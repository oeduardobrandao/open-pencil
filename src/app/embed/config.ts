// MESAAS: embed URL config parsing — pure so the test suite can exercise it without a DOM.
// URL shape: /?embed=1&docUrl=<endpoint>&parentOrigin=<host origin>[&readOnly=1]

export type EmbedConfig = {
  docUrl: string
  parentOrigin: string | null
  /** readOnly=1: view-only embed — pan/zoom only, autosave off, `save` bridge msg ignored
   * (host shows the banner; the backend refuses writes with 403 read_only regardless). */
  readOnly: boolean
}

export function parseEmbedConfig(search: string): EmbedConfig | null {
  const params = new URLSearchParams(search)
  const docUrl = params.get('docUrl')
  if (params.get('embed') !== '1' || !docUrl) return null
  return {
    docUrl,
    parentOrigin: params.get('parentOrigin'),
    readOnly: params.get('readOnly') === '1'
  }
}
