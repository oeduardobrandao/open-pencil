import { expect, mock, test } from 'bun:test'

import { EmbedAuthError, EmbedConflictError, createEmbedClient } from '@/app/embed/client'
import { parseEmbedConfig } from '@/app/embed/config'
import { createBridge } from '@/app/embed/bridge'

const cfg = { docUrl: 'https://api.test/doc?post_id=1', parentOrigin: 'https://crm.test' }

function docResponse() {
  return new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'x-rev': '7' } })
}

test('GET sends bearer token and captures rev', async () => {
  const fetchMock = mock(async () => docResponse())
  const client = createEmbedClient(cfg, fetchMock)
  client.setAccessToken('tok-1')
  const { rev } = await client.fetchDocument()
  expect(rev).toBe(7)
  const init = fetchMock.mock.calls[0][1] as RequestInit
  expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok-1')
})

test('PUT sends x-expected-rev and updates rev from response', async () => {
  const fetchMock = mock(async (_url: string, init?: RequestInit) =>
    init?.method === 'PUT'
      ? new Response('ok', { status: 200, headers: { 'x-rev': '8' } })
      : docResponse()
  )
  const client = createEmbedClient(cfg, fetchMock)
  client.setAccessToken('tok-1')
  await client.fetchDocument()
  const rev = await client.saveDocument(new Uint8Array([9]))
  expect(rev).toBe(8)
  const putInit = fetchMock.mock.calls[1][1] as RequestInit
  expect((putInit.headers as Record<string, string>)['x-expected-rev']).toBe('7')
})

test('409 throws EmbedConflictError and suspends saving', async () => {
  const fetchMock = mock(async (_url: string, init?: RequestInit) =>
    init?.method === 'PUT' ? new Response('conflict', { status: 409 }) : docResponse()
  )
  const client = createEmbedClient(cfg, fetchMock)
  client.setAccessToken('tok-1')
  await client.fetchDocument()
  expect(client.saveDocument(new Uint8Array([9]))).rejects.toBeInstanceOf(EmbedConflictError)
  expect(client.isSaveSuspended()).toBe(true)
  expect(client.saveDocument(new Uint8Array([9]))).rejects.toThrow(/suspended/)
})

test('401 throws EmbedAuthError and does NOT suspend', async () => {
  const fetchMock = mock(async (_url: string, init?: RequestInit) =>
    init?.method === 'PUT' ? new Response('unauthorized', { status: 401 }) : docResponse()
  )
  const client = createEmbedClient(cfg, fetchMock)
  client.setAccessToken('expired')
  await client.fetchDocument()
  expect(client.saveDocument(new Uint8Array([9]))).rejects.toBeInstanceOf(EmbedAuthError)
  expect(client.isSaveSuspended()).toBe(false)
})

// --- bridge ---

test('emit posts versioned message to parent origin only', () => {
  const post = mock((_message: unknown, _target: string) => {
    /* noop */
  })
  const b = createBridge('https://crm.test', { postMessage: post })
  b.emit('save:ok', { rev: 3, bytes: 100 })
  expect(post).toHaveBeenCalledWith({ v: 1, type: 'save:ok', rev: 3, bytes: 100 }, 'https://crm.test')
})

test('inbound messages are dropped unless origin and version match', () => {
  const got: string[] = []
  const b = createBridge('https://crm.test', {
    postMessage: () => {
      /* noop */
    }
  })
  b.on('auth', (m) => got.push((m as { accessToken: string }).accessToken))
  b.handleMessage({ origin: 'https://evil.test', data: { v: 1, type: 'auth', accessToken: 'x' } } as MessageEvent)
  b.handleMessage({ origin: 'https://crm.test', data: { v: 1, type: 'auth', accessToken: 'ok' } } as MessageEvent)
  b.handleMessage({ origin: 'https://crm.test', data: { v: 2, type: 'auth', accessToken: 'v2' } } as MessageEvent)
  b.handleMessage({ origin: 'https://crm.test', data: null } as MessageEvent)
  expect(got).toEqual(['ok'])
})

test('parseEmbedConfig: readOnly=1 flags view-only, absent/other values do not', () => {
  const base = '?embed=1&docUrl=https%3A%2F%2Fapi.test%2Fblob%3Fdesign_id%3D1&parentOrigin=https%3A%2F%2Fcrm.test'
  expect(parseEmbedConfig(base)?.readOnly).toBe(false)
  expect(parseEmbedConfig(`${base}&readOnly=1`)?.readOnly).toBe(true)
  expect(parseEmbedConfig(`${base}&readOnly=0`)?.readOnly).toBe(false)
  expect(parseEmbedConfig(`${base}&readOnly=1`)?.docUrl).toBe('https://api.test/blob?design_id=1')
})

test('parseEmbedConfig: null without embed=1 or docUrl', () => {
  expect(parseEmbedConfig('?docUrl=https%3A%2F%2Fapi.test')).toBe(null)
  expect(parseEmbedConfig('?embed=1')).toBe(null)
})

// ─── normalizeFrameClipping (MESAAS) ─────────────────────────────────────────

import { SceneGraph } from '@open-pencil/core'

import { normalizeFrameClipping } from '@/app/embed/normalize'

test('normalizeFrameClipping clips page-level frames, leaves nested frames and shapes alone', () => {
  const graph = new SceneGraph()
  const page = graph.getPages()[0].id
  const frameA = graph.createNode('FRAME', page, { name: '1', width: 1080, height: 1350 })
  const frameB = graph.createNode('FRAME', page, {
    name: '2',
    width: 1080,
    height: 1350,
    clipsContent: true
  })
  const nested = graph.createNode('FRAME', frameA.id, { name: 'group', width: 100, height: 100 })
  const rect = graph.createNode('RECTANGLE', page, { name: 'r', width: 10, height: 10 })

  expect(normalizeFrameClipping(graph)).toBe(1) // only frameA needed the fix
  expect(graph.getNode(frameA.id)?.clipsContent).toBe(true)
  expect(graph.getNode(frameB.id)?.clipsContent).toBe(true)
  expect(graph.getNode(nested.id)?.clipsContent).toBe(false)
  expect(graph.getNode(rect.id)?.clipsContent).toBe(false)

  expect(normalizeFrameClipping(graph)).toBe(0) // idempotent
})
