import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test'

import { exportFigFile, initCodec, parseFigFile, SceneGraph } from '@open-pencil/core'

import { expectDefined } from '#tests/helpers/assert'

setDefaultTimeout(60_000)

// MESAAS: import → createNode → re-export must never reuse an imported guid.
// New-node guids are minted as {sessionID: 1, localID: counter++}, and content
// nodes from a previous export live in session 1 too — seeding the counter past
// session-0 ids only let the first node added to an imported document steal the
// guid of an existing node, silently deleting it on the next import.
describe('roundtrip: re-export after import with created nodes', () => {
  beforeAll(async () => {
    await initCodec()
  })

  test('a node created on an imported graph keeps every imported node alive', async () => {
    const g0 = new SceneGraph()
    const page0 = g0.getPages()[0]
    g0.createNode('FRAME', page0.id, { name: 'keeper', x: 0, y: 0, width: 100, height: 100 })
    const gen1 = await exportFigFile(g0)

    const g1 = await parseFigFile(gen1.buffer as ArrayBuffer)
    const page1 = expectDefined(
      g1.getPages().find((p) => p.childIds.length > 0),
      'imported content page'
    )
    const keeper = g1.getChildren(page1.id)[0]
    expect(keeper.name).toBe('keeper')
    g1.createNode('TEXT', keeper.id, { name: 'added', text: 'hi', width: 50, height: 20 })
    const gen2 = await exportFigFile(g1)

    const g2 = await parseFigFile(gen2.buffer as ArrayBuffer)
    const page2 = expectDefined(
      g2.getPages().find((p) => p.childIds.length > 0),
      're-imported content page'
    )
    const kids = g2.getChildren(page2.id)
    expect(kids.map((n) => n.name)).toEqual(['keeper'])
    expect(g2.getChildren(kids[0].id).map((n) => n.name)).toEqual(['added'])
  })
})
