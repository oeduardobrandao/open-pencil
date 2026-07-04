// SPIKE: embed mode — load/save the document over HTTP instead of local files.
// Activated by ?embed=1&docUrl=<endpoint that GETs and PUTs .fig bytes>.
// The endpoint contract mirrors sm-crm's post-design-manage: GET returns bytes +
// `x-rev`; PUT takes bytes + `x-expected-rev` and 409s on stale rev.

const params = new URLSearchParams(window.location.search)
const docUrl = params.get('docUrl')

export const embedConfig = params.get('embed') === '1' && docUrl ? { docUrl } : null

let rev: string | null = null

export async function fetchEmbedDocument(): Promise<File> {
  if (!embedConfig) throw new Error('not in embed mode')
  const res = await fetch(embedConfig.docUrl)
  if (!res.ok) throw new Error(`embed doc fetch failed: ${res.status}`)
  rev = res.headers.get('x-rev')
  const bytes = await res.arrayBuffer()
  return new File([bytes], 'embedded.fig', { type: 'application/octet-stream' })
}

export async function saveEmbedDocument(bytes: Uint8Array): Promise<void> {
  if (!embedConfig) throw new Error('not in embed mode')
  const res = await fetch(embedConfig.docUrl, {
    method: 'PUT',
    headers: {
      'content-type': 'application/octet-stream',
      ...(rev ? { 'x-expected-rev': rev } : {})
    },
    body: bytes as unknown as BodyInit
  })
  if (res.status === 409) throw new Error('save conflict (409): document changed elsewhere')
  if (!res.ok) throw new Error(`embed save failed: ${res.status}`)
  rev = res.headers.get('x-rev')
  console.info(`[embed] saved ${bytes.length} bytes, rev=${rev}`)
}

/** Hide local-file / collab chrome. Probe-level: CSS only. */
export function installEmbedChrome() {
  if (!embedConfig) return
  const style = document.createElement('style')
  style.textContent = `
    /* SPIKE: hide the File/Edit/View menubar in embed mode. Probe-level CSS only —
       the real fork should v-if the menubar + Share button components on embedConfig
       (their UI has no stable class hooks, only tailwind utilities). */
    [role='menubar'] { display: none !important; }
  `
  document.head.appendChild(style)
  document.documentElement.dataset.embed = '1'
}
