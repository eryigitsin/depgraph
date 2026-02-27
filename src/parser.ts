import fs from "node:fs";
import path from "node:path";

export interface GraphNode {
  id: string;
  label: string;
  type: "local" | "package" | "builtin";
  extension: string;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  links: GraphLink[];
}

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".vue",
  ".svelte",
]);

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  "__pycache__",
  ".turbo",
  ".cache",
]);

const NODE_BUILTINS = new Set([
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "crypto",
  "dgram",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "https",
  "net",
  "os",
  "path",
  "punycode",
  "querystring",
  "readline",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "zlib",
  "worker_threads",
  "perf_hooks",
  "async_hooks",
  "inspector",
  "trace_events",
  "wasi",
]);

/**
 * Walk directory tree and collect all source files.
 */
function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SOURCE_EXTENSIONS.has(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * Extract import/require specifiers from file content.
 */
function extractImports(content: string): string[] {
  const specifiers: string[] = [];

  // ES import: import ... from 'specifier'
  // Also: import 'specifier' (side-effect)
  // Also: export ... from 'specifier'
  const esImportRegex =
    /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = esImportRegex.exec(content)) !== null) {
    specifiers.push(match[1]);
  }

  // Dynamic import: import('specifier')
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    specifiers.push(match[1]);
  }

  // CommonJS require: require('specifier')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    specifiers.push(match[1]);
  }

  // Deduplicate
  return [...new Set(specifiers)];
}

/**
 * Resolve a relative import specifier to an actual file path.
 */
function resolveLocalImport(
  specifier: string,
  fromFile: string,
  rootDir: string
): string | null {
  const dir = path.dirname(fromFile);
  let resolved = path.resolve(dir, specifier);

  // Try exact path first
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return resolved;
  }

  // Try adding extensions
  for (const ext of SOURCE_EXTENSIONS) {
    const withExt = resolved + ext;
    if (fs.existsSync(withExt)) {
      return withExt;
    }
  }

  // Try as directory with index file
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    for (const ext of SOURCE_EXTENSIONS) {
      const indexFile = path.join(resolved, `index${ext}`);
      if (fs.existsSync(indexFile)) {
        return indexFile;
      }
    }
  }

  return null;
}

/**
 * Classify an import specifier.
 */
function classifyImport(specifier: string): "local" | "package" | "builtin" {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return "local";
  }

  const bare = specifier.startsWith("node:")
    ? specifier.slice(5)
    : specifier.split("/")[0];

  if (NODE_BUILTINS.has(bare) || specifier.startsWith("node:")) {
    return "builtin";
  }

  return "package";
}

/**
 * Parse a project directory and return a dependency graph.
 */
export function parseProject(rootDir: string): DependencyGraph {
  const absoluteRoot = path.resolve(rootDir);
  const sourceFiles = collectSourceFiles(absoluteRoot);

  const nodesMap = new Map<string, GraphNode>();
  const links: GraphLink[] = [];

  // Create a helper for generating consistent IDs
  function getLocalId(filePath: string): string {
    return path.relative(absoluteRoot, filePath);
  }

  function getOrCreateNode(
    id: string,
    type: "local" | "package" | "builtin",
    ext: string = ""
  ): GraphNode {
    if (!nodesMap.has(id)) {
      nodesMap.set(id, {
        id,
        label: id,
        type,
        extension: ext,
      });
    }
    return nodesMap.get(id)!;
  }

  // Register all source files as nodes
  for (const file of sourceFiles) {
    const relPath = getLocalId(file);
    const ext = path.extname(file);
    getOrCreateNode(relPath, "local", ext);
  }

  // Parse each file and build links
  for (const file of sourceFiles) {
    const sourceId = getLocalId(file);
    let content: string;
    try {
      content = fs.readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    const specifiers = extractImports(content);

    for (const specifier of specifiers) {
      const importType = classifyImport(specifier);

      let targetId: string;

      if (importType === "local") {
        const resolved = resolveLocalImport(specifier, file, absoluteRoot);
        if (resolved) {
          targetId = getLocalId(resolved);
          getOrCreateNode(targetId, "local", path.extname(resolved));
        } else {
          // Unresolved local import — still add as node
          targetId = specifier;
          getOrCreateNode(targetId, "local", path.extname(specifier));
        }
      } else if (importType === "builtin") {
        const bare = specifier.startsWith("node:")
          ? specifier
          : `node:${specifier}`;
        targetId = bare;
        getOrCreateNode(targetId, "builtin");
      } else {
        // Package — use the package name (handle scoped packages)
        const parts = specifier.split("/");
        targetId =
          specifier.startsWith("@") && parts.length >= 2
            ? `${parts[0]}/${parts[1]}`
            : parts[0];
        getOrCreateNode(targetId, "package");
      }

      links.push({ source: sourceId, target: targetId });
    }
  }

  return {
    nodes: Array.from(nodesMap.values()),
    links,
  };
}

/**
 * Get summary stats for a dependency graph.
 */
export function getGraphStats(graph: DependencyGraph) {
  const localNodes = graph.nodes.filter((n) => n.type === "local").length;
  const packageNodes = graph.nodes.filter((n) => n.type === "package").length;
  const builtinNodes = graph.nodes.filter((n) => n.type === "builtin").length;

  return {
    totalNodes: graph.nodes.length,
    totalEdges: graph.links.length,
    localModules: localNodes,
    packages: packageNodes,
    builtins: builtinNodes,
  };
}
