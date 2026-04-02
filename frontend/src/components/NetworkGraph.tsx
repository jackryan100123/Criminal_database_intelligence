import React, { useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";

export type NetworkNode = { id: string; label: string; kind: string; active?: boolean };
export type NetworkLink = { source: string; target: string; role: string; remark?: string | null };

type Props = {
  nodes: NetworkNode[];
  links: NetworkLink[];
  height?: number;
};

export default function NetworkGraph({ nodes, links, height = 420 }: Props) {
  const graphData = useMemo(() => {
    const ns = nodes.map((n) => ({
      id: n.id,
      name: n.label,
      kind: n.kind,
      active: n.active,
    }));
    const ls = links.map((l) => ({
      source: l.source,
      target: l.target,
      role: l.role,
    }));
    return { nodes: ns, links: ls };
  }, [nodes, links]);

  if (!graphData.nodes.length) {
    return <div className="empty-state">No graph data yet. Add relationships to see the network.</div>;
  }

  return (
    <div className="network-graph-wrap" style={{ height }}>
      <ForceGraph2D
        graphData={graphData as any}
        nodeLabel="name"
        nodeColor={(n: any) =>
          n.kind === "criminal" ? (n.active === false ? "#f87171" : "#34d399") : "#94a3b8"
        }
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        linkWidth={1}
        linkColor={() => "rgba(148, 163, 184, 0.5)"}
        cooldownTicks={100}
      />
    </div>
  );
}
