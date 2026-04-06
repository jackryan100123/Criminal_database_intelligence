import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { useTheme } from "../theme/ThemeContext";

export type NetworkNode = { id: string; label: string; kind: string; active?: boolean };
export type NetworkLink = { source: string; target: string; role: string; remark?: string | null };

type Props = {
  nodes: NetworkNode[];
  links: NetworkLink[];
  height?: number;
  onSelectCriminal?: (criminalId: string) => void;
  onSelectNode?: (id: string, kind: string) => void;
};

function truncate(s: string, n: number) {
  const t = s.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n)}…`;
}

export default function NetworkGraph({ nodes, links, height = 420, onSelectCriminal, onSelectNode }: Props) {
  const { theme } = useTheme();
  const fgRef = useRef<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [dims, setDims] = useState({ w: 800, h: height });

  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setDims({ w: Math.max(320, r.width), h: height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setDims({ w: Math.max(320, r.width), h: height });
    return () => ro.disconnect();
  }, [height]);

  const degreeById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of links) {
      m[l.source] = (m[l.source] || 0) + 1;
      m[l.target] = (m[l.target] || 0) + 1;
    }
    return m;
  }, [links]);

  const graphData = useMemo(() => {
    const ns = nodes.map((n) => ({
      id: n.id,
      name: n.label,
      kind: n.kind,
      active: n.active,
      deg: degreeById[n.id] ?? 0,
    }));
    const ls = links.map((l) => ({
      source: l.source,
      target: l.target,
      role: l.role,
      remark: l.remark,
    }));
    return { nodes: ns, links: ls };
  }, [nodes, links, degreeById]);

  const labelColor = theme === "dark" ? "rgba(226, 232, 240, 0.92)" : "rgba(15, 23, 42, 0.88)";
  const subLabelColor = theme === "dark" ? "rgba(148, 163, 184, 0.95)" : "rgba(71, 85, 105, 0.95)";
  const bgColor = theme === "dark" ? "rgba(7, 11, 18, 0.35)" : "rgba(244, 246, 251, 0.5)";

  const fitView = useCallback(() => {
    const fg = fgRef.current;
    if (fg && graphData.nodes.length) {
      fg.zoomToFit(400, 48);
    }
  }, [graphData.nodes.length]);

  const reheat = useCallback(() => {
    fgRef.current?.d3ReheatSimulation?.();
  }, []);

  useEffect(() => {
    if (!graphData.nodes.length) return;
    const t = window.setTimeout(() => fitView(), 500);
    return () => window.clearTimeout(t);
  }, [graphData, fitView]);

  const nodeColor = useCallback(
    (n: any) => {
      const id = String(n.id);
      const hi = id === selectedId || id === hoverId;
      if (n.kind === "criminal") {
        if (n.active === false) return hi ? "#fb7185" : "#f87171";
        return hi ? "#4ade80" : "#34d399";
      }
      return hi ? "#cbd5e1" : "#94a3b8";
    },
    [hoverId, selectedId]
  );

  const linkColor = useCallback((l: any) => {
    if (l.role === "supporter") return "rgba(52, 211, 153, 0.55)";
    return "rgba(96, 165, 250, 0.55)";
  }, []);

  const linkWidth = useCallback((l: any) => {
    const r = (l.remark as string | null | undefined)?.trim();
    return r ? 2.2 : 1.4;
  }, []);

  const linkLabel = useCallback((l: any) => {
    const role = l.role === "supporter" ? "Supporter" : "Follower";
    const rm = (l.remark as string | null | undefined)?.trim();
    return rm ? `${role}: ${truncate(rm, 48)}` : role;
  }, []);

  const handleClick = useCallback(
    (n: any) => {
      const id = n?.id != null ? String(n.id) : "";
      const kind = n?.kind != null ? String(n.kind) : "";
      setSelectedId(id);
      if (id && onSelectNode) {
        onSelectNode(id, kind);
        return;
      }
      if (kind === "criminal" && id && onSelectCriminal) onSelectCriminal(id);
    },
    [onSelectCriminal, onSelectNode]
  );

  if (!graphData.nodes.length) {
    return (
      <div className="network-graph-empty">
        <p>No graph data yet.</p>
        <p className="muted small">Create criminal files and link supporters or followers to see the network.</p>
      </div>
    );
  }

  return (
    <div className="network-graph-outer">
      <div className="network-graph-toolbar">
        <div className="network-graph-legend">
          <span className="legend-item">
            <span className="legend-dot criminal" /> Criminal
          </span>
          <span className="legend-item">
            <span className="legend-dot entity" /> Person / entity
          </span>
          <span className="legend-item">
            <span className="legend-line supporter" /> Supporter link
          </span>
          <span className="legend-item">
            <span className="legend-line follower" /> Follower link
          </span>
        </div>
        <div className="network-graph-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={fitView}>
            Fit view
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reheat}>
            Re-layout
          </button>
        </div>
      </div>
      <div ref={wrapRef} className="network-graph-wrap network-graph-wrap--interactive" style={{ height: dims.h }}>
        <ForceGraph2D
          ref={fgRef}
          width={dims.w}
          height={dims.h}
          graphData={graphData as any}
          backgroundColor={bgColor}
          nodeLabel={(n: any) => `${n.name} (${n.kind})`}
          nodeColor={nodeColor}
          nodeVal={(n: any) => 5 + Math.min(n.deg || 0, 20) * 0.35}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkDirectionalArrowLength={5}
          linkDirectionalArrowRelPos={1}
          linkLabel={linkLabel}
          linkDirectionalParticles={graphData.links.length > 250 ? 0 : 1}
          linkDirectionalParticleSpeed={0.004}
          onNodeClick={handleClick}
          onNodeHover={(n: any) => setHoverId(n ? String(n.id) : null)}
          cooldownTicks={120}
          enablePanInteraction
          enableZoomInteraction
          nodeCanvasObjectMode={() => "after"}
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const label = String(node.name || "");
            const nr = 5 + Math.min(node.deg || 0, 20) * 0.35;
            const fontSize = Math.max(10 / globalScale, 8);
            ctx.font = `${fontSize}px "DM Sans", system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = labelColor;
            const line = truncate(label, 16);
            ctx.fillText(line, node.x, node.y + nr + 2 / globalScale);
            const deg = node.deg > 0 ? `${node.deg} link${node.deg === 1 ? "" : "s"}` : "";
            if (deg) {
              ctx.font = `${Math.max(9 / globalScale, 7)}px "DM Sans", system-ui, sans-serif`;
              ctx.fillStyle = subLabelColor;
              ctx.fillText(deg, node.x, node.y + nr + 2 / globalScale + fontSize + 1);
            }
          }}
        />
      </div>
      <p className="network-graph-hint muted small">
        Drag nodes to pin. Scroll to zoom. Click a node to open the criminal file or person profile. Hover links for role and remark.
      </p>
    </div>
  );
}
