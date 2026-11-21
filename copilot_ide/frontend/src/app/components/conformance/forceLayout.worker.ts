import { createForceLayout, type LayoutEdgeInput, type LayoutNodeInput } from './forceLayout';

interface WorkerRequest {
  id: number;
  nodes: LayoutNodeInput[];
  edges: LayoutEdgeInput[];
  ticks?: number;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, nodes, edges, ticks } = event.data;
  const output = createForceLayout(nodes, edges, ticks).runAll();
  self.postMessage({ id, output });
};
