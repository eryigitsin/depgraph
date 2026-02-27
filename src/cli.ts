#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import path from "node:path";
import fs from "node:fs";
import { parseProject, getGraphStats } from "./parser.js";
import { startServer } from "./server.js";

const program = new Command();

program
  .name("depgraph")
  .description("Parse import/require statements and visualize the dependency graph")
  .version("1.0.0")
  .argument("[dir]", "Project directory to analyze", ".")
  .option("-p, --port <number>", "Port for the visualization server", "3000")
  .option("-j, --json", "Output graph data as JSON instead of starting the server")
  .option("--no-packages", "Exclude npm package dependencies from the graph")
  .option("--no-builtins", "Exclude Node.js built-in modules from the graph")
  .action(async (dir: string, options: {
    port: string;
    json?: boolean;
    packages?: boolean;
    builtins?: boolean;
  }) => {
    const targetDir = path.resolve(dir);

    // Validate directory exists
    if (!fs.existsSync(targetDir)) {
      console.error(chalk.red(`✖ Directory not found: ${targetDir}`));
      process.exit(1);
    }

    if (!fs.statSync(targetDir).isDirectory()) {
      console.error(chalk.red(`✖ Not a directory: ${targetDir}`));
      process.exit(1);
    }

    console.log(chalk.cyan("\n🔍 depgraph") + chalk.gray(" — Dependency Graph Analyzer\n"));
    console.log(chalk.white(`  Scanning: ${chalk.bold(targetDir)}\n`));

    // Parse the project
    const startTime = Date.now();
    let graph = parseProject(targetDir);
    const elapsed = Date.now() - startTime;

    // Apply filters
    if (options.packages === false) {
      const packageIds = new Set(
        graph.nodes.filter((n) => n.type === "package").map((n) => n.id)
      );
      graph = {
        nodes: graph.nodes.filter((n) => n.type !== "package"),
        links: graph.links.filter(
          (l) => !packageIds.has(l.source as string) && !packageIds.has(l.target as string)
        ),
      };
    }

    if (options.builtins === false) {
      const builtinIds = new Set(
        graph.nodes.filter((n) => n.type === "builtin").map((n) => n.id)
      );
      graph = {
        nodes: graph.nodes.filter((n) => n.type !== "builtin"),
        links: graph.links.filter(
          (l) => !builtinIds.has(l.source as string) && !builtinIds.has(l.target as string)
        ),
      };
    }

    // Print stats
    const stats = getGraphStats(graph);
    console.log(chalk.green(`  ✔ Parsed in ${elapsed}ms`));
    console.log(chalk.white(`  ├─ ${chalk.bold(String(stats.totalNodes))} modules found`));
    console.log(chalk.white(`  │  ├─ ${chalk.blue(String(stats.localModules))} local files`));
    console.log(chalk.white(`  │  ├─ ${chalk.yellow(String(stats.packages))} npm packages`));
    console.log(chalk.white(`  │  └─ ${chalk.magenta(String(stats.builtins))} Node.js built-ins`));
    console.log(chalk.white(`  └─ ${chalk.bold(String(stats.totalEdges))} import relationships\n`));

    if (graph.nodes.length === 0) {
      console.log(chalk.yellow("  ⚠ No source files found. Make sure the directory contains .ts, .tsx, .js, .jsx, or other source files.\n"));
      process.exit(0);
    }

    // JSON output mode
    if (options.json) {
      console.log(JSON.stringify(graph, null, 2));
      process.exit(0);
    }

    // Start visualization server
    const port = parseInt(options.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(chalk.red(`✖ Invalid port number: ${options.port}`));
      process.exit(1);
    }

    try {
      await startServer(graph, port);
      const url = `http://localhost:${port}`;
      console.log(chalk.green(`  🌐 Graph visualization running at ${chalk.bold.underline(url)}`));
      console.log(chalk.gray(`  Press Ctrl+C to stop\n`));

      // Try to open browser
      const { exec } = await import("node:child_process");
      const openCmd =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
          ? "start"
          : "xdg-open";
      exec(`${openCmd} ${url}`);
    } catch (err: any) {
      if (err.code === "EADDRINUSE") {
        console.error(chalk.red(`✖ Port ${port} is already in use. Try a different port with --port`));
      } else {
        console.error(chalk.red(`✖ Failed to start server: ${err.message}`));
      }
      process.exit(1);
    }
  });

program.parse();
