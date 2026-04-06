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

/** Criminal = warm orange (distinct from edge greens/blues). Edges: supporter = emerald, follower = sky. */
const COLORS = {
  criminalFill: "#ea580c",
  criminalFillInactive: "#b91c1c",
  criminalRing: "#fdba74",
  entityFill: "#475569",
  entityRing: "#94a3b8",
  supporterLink: "rgba(16, 185, 129, 0.92)",
  followerLink: "rgba(56, 189, 248, 0.92)",
  arrowSupporter: "#34d399",
  arrowFollower: "#38bdf8",
} as const;

export default function NetworkGraph({ nodes, links, height = 420, onSelectCriminal, onSelectNode }: Props) {
  const { theme } = useTheme();
  const fgRef = useRef<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverLink, setHoverLink] = useState<any>(null);
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

  const labelColor = theme === "dark" ? "#f1f5f9" : "#0f172a";
  const subLabelColor = theme === "dark" ? "#94a3b8" : "#64748b";
  const bgColor = theme === "dark" ? "#0a0f16" : "#f1f5f9";

  /** Wider spacing, less vertical stacking. */
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !graphData.nodes.length) return;
    const charge = fg.d3Force("charge");
    if (charge) charge.strength(-420);
    const linkF = fg.d3Force("link");
    if (linkF) {
      linkF.distance(110);
      linkF.strength(0.55);
    }
    fg.d3VelocityDecay?.(0.38);
    fg.d3ReheatSimulation?.();
  }, [graphData, dims.w, graphData.nodes.length]);

  const fitView = useCallback(() => {
    const fg = fgRef.current;
    if (fg && graphData.nodes.length) {
      fg.zoomToFit(500, 72);
    }
  }, [graphData.nodes.length]);

  const reheat = useCallback(() => {
    const fg = fgRef.current;
    fg?.d3ReheatSimulation?.();
  }, []);

  useEffect(() => {
    if (!graphData.nodes.length) return;
    const t = window.setTimeout(() => fitView(), 600);
    return () => window.clearTimeout(t);
  }, [graphData, fitView]);

  const nodeRadius = useCallback((n: any) => Math.max(5, 6 + Math.min(n.deg || 0, 18) * 0.45), []);

  const nodeColor = useCallback(
    (n: any) => {
      const id = String(n.id);
      const hi = id === selectedId || id === hoverId;
      if (n.kind === "criminal") {
        if (n.active === false) return hi ? "#f87171" : COLORS.criminalFillInactive;
        return hi ? "#fb923c" : COLORS.criminalFill;
      }
      return hi ? "#94a3b8" : COLORS.entityFill;
    },
    [hoverId, selectedId]
  );

  const linkColor = useCallback(
    (l: any) => {
      const isSup = l.role === "supporter";
      if (hoverLink && l === hoverLink) return isSup ? "#6ee7b7" : "#7dd3fc";
      return isSup ? COLORS.supporterLink : COLORS.followerLink;
    },
    [hoverLink]
  );

  const linkWidth = useCallback(
    (l: any) => {
      const base = (l.remark as string | null | undefined)?.trim() ? 3.2 : 2.4;
      return hoverLink && l === hoverLink ? base + 1.2 : base;
    },
    [hoverLink]
  );

  const linkLabel = useCallback((l: any) => {
    const role = l.role === "supporter" ? "Supporter" : "Follower";
    const rm = (l.remark as string | null | undefined)?.trim();
    return rm ? `${role}: ${truncate(rm, 40)}` : `${role} link`;
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

  const drawLabelWithHalo = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    fontPx: number,
    fill: string,
    halo: string
  ) => {
    ctx.font = `600 ${fontPx}px "DM Sans", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeStyle = halo;
    ctx.lineWidth = Math.max(3, fontPx * 0.35);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  };

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
        <div className="network-graph-legend network-graph-legend--v2">
          <span className="legend-item">
            <span className="legend-dot legend-dot--criminal" /> Criminal case
          </span>
          <span className="legend-item">
            <span className="legend-dot legend-dot--entity" /> Person / entity
          </span>
          <span className="legend-item">
            <span className="legend-line legend-line--supporter" /> Supporter
          </span>
          <span className="legend-item">
            <span className="legend-line legend-line--follower" /> Follower
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
      <div ref={wrapRef} className="network-graph-wrap network-graph-wrap--interactive network-graph-wrap--v2" style={{ height: dims.h }}>
        <ForceGraph2D
          ref={fgRef}
          width={dims.w}
          height={dims.h}
          graphData={graphData as any}
          backgroundColor={bgColor}
          nodeLabel={() => ""}
          nodeVal={nodeRadius}
          nodeColor={nodeColor}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkDirectionalArrowLength={10}
          linkDirectionalArrowRelPos={1}
          linkDirectionalArrowColor={(l: any) => (l.role === "supporter" ? COLORS.arrowSupporter : COLORS.arrowFollower)}
          linkLabel={linkLabel}
          linkDirectionalParticles={0}
          onNodeClick={handleClick}
          onNodeHover={(n: any) => setHoverId(n ? String(n.id) : null)}
          onLinkHover={(l: any) => setHoverLink(l || null)}
          cooldownTicks={220}
          warmupTicks={80}
          enablePanInteraction
          enableZoomInteraction
          nodeCanvasObjectMode={() => "replace"}
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const r = nodeRadius(node);
            const isCriminal = node.kind === "criminal";
            const inactive = isCriminal && node.active === false;
            const nid = String(node.id);
            const hi = nid === selectedId || nid === hoverId;

            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = inactive ? COLORS.criminalFillInactive : isCriminal ? COLORS.criminalFill : COLORS.entityFill;
            ctx.fill();
            ctx.strokeStyle = isCriminal ? COLORS.criminalRing : COLORS.entityRing;
            ctx.lineWidth = Math.max(1.2, 2.2 / globalScale);
            ctx.stroke();

            if (hi) {
              ctx.beginPath();
              ctx.arc(node.x, node.y, r + 3.5 / globalScale, 0, 2 * Math.PI);
              ctx.strokeStyle = "rgba(251, 191, 36, 0.85)";
              ctx.lineWidth = Math.max(1.5, 2.5 / globalScale);
              ctx.stroke();
            }

            const kindTag = isCriminal ? "Case" : "Entity";
            const name = truncate(String(node.name || ""), 24);
            const sub =
              node.deg > 0
                ? `${node.deg} connection${node.deg === 1 ? "" : "s"}`
                : isCriminal
                  ? "Criminal file"
                  : "Profile";

            const fs = Math.max(11 / globalScale, 9);
            const fsTag = Math.max(8 / globalScale, 6.5);
            const fsSub = Math.max(8.5 / globalScale, 7);
            const lineStart = node.y + r + 8 / globalScale;
            const halo = theme === "dark" ? "rgba(0,0,0,0.92)" : "rgba(255,255,255,0.95)";

            ctx.font = `700 ${fsTag}px "DM Sans", system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = isCriminal ? "rgba(251, 191, 36, 0.95)" : "rgba(148, 163, 184, 0.95)";
            ctx.strokeStyle = halo;
            ctx.lineWidth = Math.max(2.5, 3 / globalScale);
            ctx.strokeText(kindTag, node.x, lineStart);
            ctx.fillText(kindTag, node.x, lineStart);

            const nameY = lineStart + fsTag + 3 / globalScale;
            drawLabelWithHalo(ctx, name, node.x, nameY, fs, labelColor, halo);

            ctx.font = `500 ${fsSub}px "DM Sans", system-ui, sans-serif`;
            ctx.fillStyle = subLabelColor;
            ctx.textAlign = "center";
            ctx.fillText(sub, node.x, nameY + fs + 4 / globalScale);
          }}
        />
      </div>
      <p className="network-graph-hint muted small">
        Orange = criminal <strong>case file</strong>, slate = <strong>person/entity</strong>. Green edge = supporter, blue = follower. Drag nodes to untangle;
        scroll to zoom. Hover an edge for remark; click a node to open.
      </p>
    </div>
  );
}
