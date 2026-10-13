import type { DesignExport } from '../../../../shared/designGraph'
import type { Scene } from '../flow/scene'
import { describeDesignGraph } from './describeDesignGraph'
import { exportDesignGraph } from './exportDesignGraph'
import { exportDesignPng } from './exportDesignPng'

export { describeDesignGraph } from './describeDesignGraph'
export { exportDesignGraph } from './exportDesignGraph'
export { exportDesignPng } from './exportDesignPng'

/**
 * Design Graph, text description and PNG of a Design Scene (`DesignCanvasHandle.getScene()` for
 * the live canvas), ready for `design:exportScene` and `protocol:submitStep`.
 */
export async function exportDesign(scene: Scene, designExerciseId: number): Promise<DesignExport> {
  const graph = exportDesignGraph(scene)
  return {
    designExerciseId,
    graph,
    description: describeDesignGraph(graph),
    png: await exportDesignPng(scene)
  }
}
