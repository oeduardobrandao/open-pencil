import { expect, mock, test } from 'bun:test'

import { EmbedAuthError, EmbedConflictError, createEmbedClient } from '@/app/embed/client'
import { createBridge } from '@/app/embed/bridge'

const cfg = { docUrl: 'https://api.test/doc?post_id=1', parentOrigin: 'https://crm.test' }

function docResponse() {
  return new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'x-rev': '7' } })
}

test('GET sends bearer token and captures rev', async () => {
  const fetchMock = mock(async () => docResponse())
  const client = createEmbedClient(cfg, fetchMock as unknown as typeof fetch)
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
  const client = createEmbedClient(cfg, fetchMock as unknown as typeof fetch)
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
  const client = createEmbedClient(cfg, fetchMock as unknown as typeof fetch)
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
  const client = createEmbedClient(cfg, fetchMock as unknown as typeof fetch)
  client.setAccessToken('expired')
  await client.fetchDocument()
  expect(client.saveDocument(new Uint8Array([9]))).rejects.toBeInstanceOf(EmbedAuthError)
  expect(client.isSaveSuspended()).toBe(false)
})

// --- bridge ---

test('emit posts versioned message to parent origin only', () => {
  const post = mock(() => {})
  const b = createBridge('https://crm.test', { postMessage: post } as unknown as Window)
  b.emit('save:ok', { rev: 3, bytes: 100 })
  expect(post).toHaveBeenCalledWith({ v: 1, type: 'save:ok', rev: 3, bytes: 100 }, 'https://crm.test')
})

test('inbound messages are dropped unless origin and version match', () => {
  const got: string[] = []
  const b = createBridge('https://crm.test', { postMessage: () => {} } as unknown as Window)
  b.on('auth', (m) => got.push((m as { accessToken: string }).accessToken))
  b.handleMessage({ origin: 'https://evil.test', data: { v: 1, type: 'auth', accessToken: 'x' } } as MessageEvent)
  b.handleMessage({ origin: 'https://crm.test', data: { v: 1, type: 'auth', accessToken: 'ok' } } as MessageEvent)
  b.handleMessage({ origin: 'https://crm.test', data: { v: 2, type: 'auth', accessToken: 'v2' } } as MessageEvent)
  b.handleMessage({ origin: 'https://crm.test', data: null } as MessageEvent)
  expect(got).toEqual(['ok'])
})
