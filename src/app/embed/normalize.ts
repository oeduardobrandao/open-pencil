// MESAAS: post pages must clip their content — the node-scoped export crops to the frame
// bounds, so an unclipped canvas shows overflow that never ships (and unclipped exports
// grow past the frame). Normalizes docs that predate clip-on-create; page-level frames
// only (nested frames are the user's own grouping, classifyFrames never reads them).
import type { SceneGraph } from '@open-pencil/core/scene-graph'

export function normalizeFrameClipping(graph: SceneGraph): number {
  let changed = 0
  for (const page of graph.getPages()) {
    for (const node of graph.getChildren(page.id)) {
      if (node.type === 'FRAME' && !node.clipsContent) {
        graph.updateNode(node.id, { clipsContent: true })
        changed++
      }
    }
  }
  return changed
}
