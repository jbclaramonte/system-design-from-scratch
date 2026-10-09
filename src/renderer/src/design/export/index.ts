import type { Editor } from 'tldraw'
import type { DesignExport } from '../../../../shared/designGraph'
import { describeDesignGraph } from './describeDesignGraph'
import { exportDesignGraph } from './exportDesignGraph'
import { exportDesignPng, type DesignPngOptions } from './exportDesignPng'

export { describeDesignGraph } from './describeDesignGraph'
export { buildDesignGraph, exportDesignGraph, richTextToPlain } from './exportDesignGraph'
export { exportDesignPng, type DesignPngOptions } from './exportDesignPng'

/** Design Graph, text description and PNG of the live scene, ready for `design:exportScene`. */
export async function exportDesign(
  editor: Editor,
  designExerciseId: number,
  pngOptions?: DesignPngOptions
): Promise<DesignExport> {
  const graph = exportDesignGraph(editor)
  return {
    designExerciseId,
    graph,
    description: describeDesignGraph(graph),
    png: await exportDesignPng(editor, pngOptions)
  }
}
