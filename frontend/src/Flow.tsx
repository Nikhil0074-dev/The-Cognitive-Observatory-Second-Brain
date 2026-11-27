import { useMemo } from 'react';
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import { PALETTE } from './Graph';
import type { C, E, N } from './types';

type D = { title: string; source: string; color: string; sel: boolean; dim: boolean; big: boolean };
const MAX = 250; // React Flow renders real DOM nodes: keep it to the most important notes (use the canvas or 3D views for more)

function NoteNode({ data }: NodeProps<Node<D>>) {
  return (
    <div className={'fnode' + (data.sel ? ' sel' : '') + (data.dim ? ' dim' : '') + (data.big ? ' big' : '')} style={{ borderLeftColor: data.color }}>
      <Handle type="target" position={Position.Top} className="fh" />
      <div className="ft">{data.title}</div><div className="fs mono">{data.source}</div>
      <Handle type="source" position={Position.Bottom} className="fh" />
    </div>
  );
}
const nodeTypes = { note: NoteNode };

/** Static force layout (clusters pulled toward points on an ellipse) so the node map opens already organised. */
function layout(nodes: N[], edges: E[], clusters: C[]) {
  const idx = new Map(clusters.map((c, i) => [c.id, i])), k = Math.max(clusters.length, 1), R = Math.max(380, nodes.length * 9);
  const sn: any[] = nodes.map((n, i) => { const a = ((idx.get(n.cluster_id as string) ?? 0) / k) * Math.PI * 2 - Math.PI / 2, cx = Math.cos(a) * R, cy = Math.sin(a) * R * 0.75; return { id: n.id, cx, cy, x: cx + ((i * 37) % 100) - 50, y: cy + ((i * 59) % 100) - 50 }; });
  const ids = new Set(sn.map(n => n.id)), links = edges.filter(e => ids.has(e.source) && ids.has(e.target)).map(e => ({ source: e.source, target: e.target }));
  const sim = forceSimulation(sn).force('link', forceLink(links).id((d: any) => d.id).distance(120).strength(0.08)).force('charge', forceManyBody().strength(-140))
    .force('collide', forceCollide(82)).force('x', forceX((d: any) => d.cx).strength(0.12)).force('y', forceY((d: any) => d.cy).strength(0.12)).stop();
  for (let i = 0; i < 300; i++) sim.tick();
  return new Map(sn.map(n => [n.id, { x: n.x, y: n.y }]));
}

type Props = { nodes: N[]; edges: E[]; clusters: C[]; selected: string | null; highlight: Set<string>; relFilter: string; onSelect: (id: string | null) => void };
export default function Flow({ nodes, edges, clusters, selected, highlight, relFilter, onSelect }: Props) {
  const shown = useMemo(() => (nodes.length > MAX ? [...nodes].sort((a, b) => b.rank - a.rank).slice(0, MAX) : nodes), [nodes]);
  const pos = useMemo(() => layout(shown, edges, clusters), [shown, edges, clusters]);
  const cIdx = useMemo(() => new Map(clusters.map((c, i) => [c.id, i])), [clusters]);
  const byId = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  const nbrs = useMemo(() => { const s = new Set<string>(); if (selected) edges.forEach(e => { if (e.source === selected) s.add(e.target); if (e.target === selected) s.add(e.source); }); return s; }, [edges, selected]);
  const rfNodes: Node<D>[] = useMemo(() => shown.map(n => ({
    id: n.id, type: 'note', position: pos.get(n.id)!, draggable: true, initialWidth: 150, initialHeight: 40, // lets the minimap draw before nodes are measured
    data: { title: n.title, source: n.source, color: PALETTE[(cIdx.get(n.cluster_id as string) ?? 0) % 8], sel: n.id === selected, big: n.rank > 0.75,
      dim: (highlight.size > 0 && !highlight.has(n.id) && n.id !== selected) || (!!selected && n.id !== selected && !nbrs.has(n.id) && highlight.size === 0) },
  })), [shown, pos, cIdx, selected, highlight, nbrs]);

  const rfEdges: Edge[] = useMemo(() => {
    const ids = new Set(shown.map(n => n.id));
    return edges.filter(e => ids.has(e.source) && ids.has(e.target)).filter(e => relFilter === 'all' || (relFilter === 'CONTRADICTS' ? e.type === 'CONTRADICTS' : e.type === 'RELATED_TO' && byId.get(e.source)?.cluster_id !== byId.get(e.target)?.cluster_id)).map(e => {
      const con = e.type === 'CONTRADICTS', inc = !!selected && (e.source === selected || e.target === selected);
      return { id: `${e.source}-${e.target}-${e.type}`, source: e.source, target: e.target, type: 'straight', animated: con || inc,
        label: con ? '≠' : inc && e.similarity != null ? e.similarity.toFixed(2) : undefined, labelStyle: { fill: con ? '#FF4D5A' : '#D7FF64', fontFamily: 'IBM Plex Mono', fontSize: 11 }, labelBgStyle: { fill: '#0A0E12' },
        style: { stroke: con ? '#FF4D5A' : inc ? '#D7FF64' : '#6E7E78', strokeWidth: con || inc ? 1.8 : 1, opacity: con || inc ? 1 : selected ? 0.12 : 0.1 + ((e.similarity ?? 0.8) - 0.75) * 2.2, strokeDasharray: con ? '6 4' : undefined } } as Edge;
    });
  }, [edges, shown, relFilter, selected, byId]);

  return (
    <div className="graph flowwrap">
      <ReactFlow key={shown.length} nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} colorMode="dark" fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.15} maxZoom={2.5}
        onNodeClick={(_, n) => onSelect(n.id)} onPaneClick={() => onSelect(null)} nodesConnectable={false} elementsSelectable={false}>
        <Background color="#1E2A2D" gap={28} />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap pannable zoomable nodeColor={(n: any) => n.data?.color || '#6E7E78'} nodeStrokeColor="#0A0E12" nodeStrokeWidth={3} nodeBorderRadius={2} maskColor="#0A0E1299" />
      </ReactFlow>
      {nodes.length > MAX && <div className="flownote mono">showing the {MAX} most connected of {nodes.length} notes</div>}
    </div>
  );
}
