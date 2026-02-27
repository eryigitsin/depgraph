import React, { useEffect, useState, useCallback, useRef } from "react";
import ForceGraph2D, {
  type ForceGraphMethods,
} from "react-force-graph-2d";

interface GraphNode {
  id: string;
  label: string;
  type: "local" | "package" | "builtin";
  extension: string;
  // Force graph injects these:
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

const TYPE_COLORS: Record<string, string> = {
  local: "#4fc3f7",
  package: "#ffb74d",
  builtin: "#ce93d8",
};

const EXTENSION_COLORS: Record<string, string> = {
  ".ts": "#3178c6",
  ".tsx": "#2e7d9e",
  ".js": "#f7df1e",
  ".jsx": "#61dafb",
  ".mjs": "#f7df1e",
  ".cjs": "#f7df1e",
  ".vue": "#42b883",
  ".svelte": "#ff3e00",
  ".css": "#264de4",
  ".json": "#5b5ea6",
};

function getNodeColor(node: GraphNode): string {
  if (node.type === "local" && node.extension && EXTENSION_COLORS[node.extension]) {
    return EXTENSION_COLORS[node.extension];
  }
  return TYPE_COLORS[node.type] || "#aaaaaa";
}

function getNodeSize(node: GraphNode): number {
  switch (node.type) {
    case "local":
      return 5;
    case "package":
      return 4;
    case "builtin":
      return 3;
    default:
      return 4;
  }
}

export default function App() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showTypes, setShowTypes] = useState({
    local: true,
    package: true,
    builtin: true,
  });
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);

  // Fetch graph data
  useEffect(() => {
    fetch("/api/graph")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: GraphData) => {
        setGraphData(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Filter graph data
  const filteredData = React.useMemo(() => {
    if (!graphData) return null;

    const visibleNodes = graphData.nodes.filter((node) => {
      if (!showTypes[node.type]) return false;
      if (searchTerm && !node.id.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      return true;
    });

    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const visibleLinks = graphData.links.filter((link) => {
      const sourceId = typeof link.source === "string" ? link.source : link.source.id;
      const targetId = typeof link.target === "string" ? link.target : link.target.id;
      return visibleIds.has(sourceId) && visibleIds.has(targetId);
    });

    return { nodes: visibleNodes, links: visibleLinks };
  }, [graphData, showTypes, searchTerm]);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (graphRef.current) {
        graphRef.current.centerAt(node.x, node.y, 500);
        graphRef.current.zoom(4, 500);
      }
    },
    []
  );

  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.label.split("/").pop() || node.label;
      const size = getNodeSize(node);
      const color = getNodeColor(node);
      const isHovered = hoveredNode?.id === node.id;

      const x = node.x ?? 0;
      const y = node.y ?? 0;

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.fillStyle = isHovered ? "#ffffff" : color;
      ctx.fill();

      if (isHovered) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Label (only show when zoomed in enough)
      if (globalScale > 1.5 || isHovered) {
        const fontSize = Math.max(12 / globalScale, 2);
        ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isHovered ? "#ffffff" : "rgba(255, 255, 255, 0.7)";
        ctx.fillText(label, x, y + size + 2);
      }
    },
    [hoveredNode]
  );

  if (loading) {
    return (
      <div style={styles.centered}>
        <div style={styles.spinner} />
        <p style={{ marginTop: 16 }}>Loading dependency graph...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.centered}>
        <p style={{ color: "#ef5350", fontSize: 18 }}>Failed to load graph data</p>
        <p style={{ color: "#999", marginTop: 8 }}>{error}</p>
      </div>
    );
  }

  if (!filteredData) return null;

  const stats = graphData
    ? {
        total: graphData.nodes.length,
        local: graphData.nodes.filter((n) => n.type === "local").length,
        packages: graphData.nodes.filter((n) => n.type === "package").length,
        builtins: graphData.nodes.filter((n) => n.type === "builtin").length,
        edges: graphData.links.length,
      }
    : null;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Graph */}
      <ForceGraph2D
        ref={graphRef as any}
        graphData={filteredData}
        width={dimensions.width}
        height={dimensions.height}
        nodeCanvasObject={nodeCanvasObject as any}
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
          const size = getNodeSize(node);
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, size + 2, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkColor={() => "rgba(255, 255, 255, 0.08)"}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowRelPos={1}
        linkDirectionalArrowColor={() => "rgba(255, 255, 255, 0.15)"}
        onNodeHover={(node: any) => setHoveredNode(node || null)}
        onNodeClick={handleNodeClick as any}
        backgroundColor="#0a0a0f"
        cooldownTicks={200}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
      />

      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>
          <span style={{ color: "#4fc3f7" }}>dep</span>
          <span style={{ color: "#fff" }}>graph</span>
        </h1>
        {stats && (
          <div style={styles.statsRow}>
            <span style={styles.statBadge}>
              {stats.total} modules
            </span>
            <span style={styles.statBadge}>
              {stats.edges} imports
            </span>
          </div>
        )}
      </div>

      {/* Controls Panel */}
      <div style={styles.panel}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search modules..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={styles.searchInput}
        />

        {/* Filters */}
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>
            <input
              type="checkbox"
              checked={showTypes.local}
              onChange={(e) => setShowTypes({ ...showTypes, local: e.target.checked })}
            />
            <span style={{ ...styles.dot, background: TYPE_COLORS.local }} />
            Local ({stats?.local})
          </label>
          <label style={styles.filterLabel}>
            <input
              type="checkbox"
              checked={showTypes.package}
              onChange={(e) => setShowTypes({ ...showTypes, package: e.target.checked })}
            />
            <span style={{ ...styles.dot, background: TYPE_COLORS.package }} />
            Packages ({stats?.packages})
          </label>
          <label style={styles.filterLabel}>
            <input
              type="checkbox"
              checked={showTypes.builtin}
              onChange={(e) => setShowTypes({ ...showTypes, builtin: e.target.checked })}
            />
            <span style={{ ...styles.dot, background: TYPE_COLORS.builtin }} />
            Built-ins ({stats?.builtins})
          </label>
        </div>

        {/* Legend */}
        <div style={styles.legend}>
          <p style={styles.legendTitle}>File Types</p>
          <div style={styles.legendItems}>
            {Object.entries(EXTENSION_COLORS).map(([ext, color]) => (
              <span key={ext} style={styles.legendItem}>
                <span style={{ ...styles.dot, background: color }} />
                {ext}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Hovered node info */}
      {hoveredNode && (
        <div style={styles.tooltip}>
          <p style={styles.tooltipTitle}>{hoveredNode.id}</p>
          <p style={styles.tooltipMeta}>
            Type: <span style={{ color: TYPE_COLORS[hoveredNode.type] }}>{hoveredNode.type}</span>
            {hoveredNode.extension && ` • ${hoveredNode.extension}`}
          </p>
        </div>
      )}

      {/* Help text */}
      <div style={styles.helpText}>
        Scroll to zoom • Drag to pan • Click node to focus
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  centered: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    color: "#e0e0e0",
  },
  spinner: {
    width: 40,
    height: 40,
    border: "3px solid rgba(255,255,255,0.1)",
    borderTop: "3px solid #4fc3f7",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  header: {
    position: "absolute",
    top: 16,
    left: 16,
    zIndex: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  statsRow: {
    display: "flex",
    gap: 8,
  },
  statBadge: {
    background: "rgba(255,255,255,0.08)",
    borderRadius: 6,
    padding: "2px 8px",
    fontSize: 12,
    color: "#bbb",
  },
  panel: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 220,
    background: "rgba(15, 15, 25, 0.9)",
    backdropFilter: "blur(10px)",
    borderRadius: 12,
    padding: 16,
    zIndex: 10,
    border: "1px solid rgba(255,255,255,0.06)",
  },
  searchInput: {
    width: "100%",
    padding: "8px 10px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 13,
    outline: "none",
    marginBottom: 12,
  },
  filterGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginBottom: 16,
  },
  filterLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "#ccc",
    cursor: "pointer",
  },
  dot: {
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
  },
  legend: {
    borderTop: "1px solid rgba(255,255,255,0.06)",
    paddingTop: 12,
  },
  legendTitle: {
    fontSize: 11,
    color: "#888",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 8,
  },
  legendItems: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    color: "#aaa",
  },
  tooltip: {
    position: "absolute",
    bottom: 60,
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(15, 15, 25, 0.95)",
    backdropFilter: "blur(10px)",
    borderRadius: 10,
    padding: "10px 16px",
    zIndex: 10,
    border: "1px solid rgba(255,255,255,0.1)",
    textAlign: "center" as const,
    maxWidth: 500,
  },
  tooltipTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#fff",
    wordBreak: "break-all" as const,
  },
  tooltipMeta: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  helpText: {
    position: "absolute",
    bottom: 16,
    left: "50%",
    transform: "translateX(-50%)",
    fontSize: 12,
    color: "rgba(255,255,255,0.25)",
    zIndex: 10,
  },
};
