import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DependencyGraph } from "./parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

/**
 * Start a local HTTP server to serve the graph UI.
 */
export function startServer(
  graph: DependencyGraph,
  port: number
): Promise<http.Server> {
  const uiDir = path.join(__dirname, "ui");

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://localhost:${port}`);

      // API endpoint: serve graph data as JSON
      if (url.pathname === "/api/graph") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(graph));
        return;
      }

      // Serve static files from the built UI directory
      let filePath = path.join(uiDir, url.pathname === "/" ? "index.html" : url.pathname);

      // Security: prevent directory traversal
      if (!filePath.startsWith(uiDir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      // Try to read and serve the file
      fs.readFile(filePath, (err, data) => {
        if (err) {
          // SPA fallback: serve index.html for unmatched routes
          if (err.code === "ENOENT") {
            const indexPath = path.join(uiDir, "index.html");
            fs.readFile(indexPath, (err2, indexData) => {
              if (err2) {
                res.writeHead(404);
                res.end("Not Found");
                return;
              }
              res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
              res.end(indexData);
            });
            return;
          }
          res.writeHead(500);
          res.end("Internal Server Error");
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
      });
    });

    server.on("error", reject);
    server.listen(port, () => resolve(server));
  });
}
