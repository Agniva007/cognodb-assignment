"use client";
import { useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ForceGraphMethods, NodeObject } from "react-force-graph-2d";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

export interface BlastGraphNode {
  name: string;
  distance: number;
  weeklyDownloads: number;
}
export interface BlastGraphEdge {
  from: string;
  to: string;
}

/* Hop distance → sequential blue ramp (dark-surface steps); the vulnerable
   root wears the critical status color and is also the largest node + labeled,
   so color never carries the distinction alone. */
const HOP_COLORS = ["#d03b3b", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb", "#e4eefb"];

interface GraphNode extends NodeObject {
  id: string;
  distance: number;
  downloads: number;
  radius: number;
}

export function BlastGraph({
  nodes,
  edges,
  height = 520,
}: {
  nodes: BlastGraphNode[];
  edges: BlastGraphEdge[];
  height?: number;
}) {
  const router = useRouter();
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);

  const data = useMemo(() => {
    const maxDl = Math.max(...nodes.map((n) => n.weeklyDownloads), 1);
    return {
      nodes: nodes.map<GraphNode>((n) => ({
        id: n.name,
        distance: n.distance,
        downloads: n.weeklyDownloads,
        radius:
          n.distance === 0
            ? 10
            : 3.5 + 5 * Math.sqrt(n.weeklyDownloads / maxDl), // area ∝ downloads
      })),
      links: edges.map((e) => ({ source: e.from, target: e.to })),
    };
  }, [nodes, edges]);

  const paint = useCallback(
    (node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode;
      const color = HOP_COLORS[Math.min(n.distance, HOP_COLORS.length - 1)];
      ctx.beginPath();
      ctx.arc(n.x!, n.y!, n.radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      // 2px surface ring keeps overlapping marks separable
      ctx.lineWidth = 2 / globalScale;
      ctx.strokeStyle = "#1a1a19";
      ctx.stroke();
      // label the root and, when zoomed in, everything else
      if (n.distance === 0 || globalScale > 2.2) {
        ctx.font = `${n.distance === 0 ? 5 : 4}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = n.distance === 0 ? "#ffffff" : "#c3c2b7";
        ctx.fillText(n.id, n.x!, n.y! + n.radius + 5);
      }
    },
    []
  );

  return (
    <div className="relative overflow-hidden rounded-xl" style={{ height }}>
      <ForceGraph2D
        ref={fgRef}
        graphData={data}
        height={height}
        backgroundColor="#1a1a19"
        nodeCanvasObject={paint}
        nodePointerAreaPaint={(node, color, ctx) => {
          const n = node as GraphNode;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, Math.max(n.radius, 8), 0, 2 * Math.PI); // hit target ≥ mark
          ctx.fillStyle = color;
          ctx.fill();
        }}
        nodeLabel={(node) => {
          const n = node as GraphNode;
          return `<div style="font: 12px system-ui; padding: 2px 4px">
            <b>${n.id}</b><br/>${n.distance === 0 ? "vulnerable package" : `${n.distance} hop${n.distance > 1 ? "s" : ""} from the vulnerability`}</div>`;
        }}
        linkColor={() => "rgba(255,255,255,0.14)"}
        linkDirectionalArrowLength={2.5}
        linkDirectionalArrowRelPos={1}
        onNodeClick={(node) => router.push(`/package/${encodeURIComponent(String(node.id))}`)}
        cooldownTicks={120}
        onEngineStop={() => fgRef.current?.zoomToFit(400, 40)}
      />
      <div
        className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 text-xs"
        style={{ background: "rgba(13,13,13,0.75)", color: "#c3c2b7" }}
      >
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: HOP_COLORS[0] }} />
          vulnerable package
        </span>
        {[1, 2, 3, 4].map((d) => (
          <span key={d} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: HOP_COLORS[d] }} />
            {d} hop{d > 1 ? "s" : ""}
          </span>
        ))}
        <span className="text-[var(--muted)]">size = weekly downloads · click a node to open it</span>
      </div>
    </div>
  );
}
