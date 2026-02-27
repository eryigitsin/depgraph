#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execSync } from "node:child_process";
import { parseProject, getGraphStats } from "./parser.js";
import { startServer } from "./server.js";

/**
 * Detect if input looks like a GitHub repo URL or shorthand.
 * Supports:
 *   https://github.com/user/repo
 *   https://github.com/user/repo.git
 *   github.com/user/repo
 *   user/repo  (GitHub shorthand)
 */
function parseGitHubInput(input: string): { cloneUrl: string; repoName: string } | null {
  // Full HTTPS URL
  const httpsMatch = input.match(
    /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/
  );
  if (httpsMatch) {
    const url = input.endsWith(".git") ? input : `${input}.git`;
    return { cloneUrl: url, repoName: `${httpsMatch[1]}/${httpsMatch[2]}` };
  }

  // github.com/user/repo (no protocol)
  const noProtoMatch = input.match(
    /^github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/
  );
  if (noProtoMatch) {
    const url = `https://${input}${input.endsWith(".git") ? "" : ".git"}`;
    return { cloneUrl: url, repoName: `${noProtoMatch[1]}/${noProtoMatch[2]}` };
  }

  // Shorthand: user/repo (exactly one slash, no dots or protocols)
  const shortMatch = input.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (shortMatch && !input.includes(".") && !input.includes(":")) {
    return {
      cloneUrl: `https://github.com/${input}.git`,
      repoName: input,
    };
  }

  return null;
}

/**
 * Shallow-clone a public GitHub repo into a temp directory.
 */
function cloneRepo(cloneUrl: string, repoName: string): string {
  const tmpDir = path.join(os.tmpdir(), `depgraph-${repoName.replace("/", "-")}-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  console.log(chalk.white(`  Cloning ${chalk.bold(repoName)} into temp directory...`));
  try {
    execSync(`git clone --depth 1 ${cloneUrl} "${tmpDir}"`, {
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 60_000,
    });
  } catch (err: any) {
    const stderr = err.stderr?.toString() || err.message;
    if (stderr.includes("not found") || stderr.includes("does not exist")) {
      console.error(chalk.red(`\n  ✖ Repository not found: ${repoName}`));
      console.error(chalk.gray(`    Make sure the repo is public and the URL is correct.\n`));
    } else {
      console.error(chalk.red(`\n  ✖ Failed to clone repository: ${stderr}\n`));
    }
    // Clean up on failure
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    process.exit(1);
  }

  console.log(chalk.green(`  ✔ Cloned successfully\n`));
  return tmpDir;
}

const program = new Command();

program
  .name("depgraph")
  .description("Parse import/require statements and visualize the dependency graph")
  .version("1.0.0")
  .argument("[target]", "Local directory, GitHub URL, or user/repo shorthand", ".")
  .option("-p, --port <number>", "Port for the visualization server", "3000")
  .option("-j, --json", "Output graph data as JSON instead of starting the server")
  .option("--no-packages", "Exclude npm package dependencies from the graph")
  .option("--no-builtins", "Exclude Node.js built-in modules from the graph")
  .action(async (target: string, options: {
    port: string;
    json?: boolean;
    packages?: boolean;
    builtins?: boolean;
  }) => {
    console.log(chalk.cyan("\n🔍 depgraph") + chalk.gray(" — Dependency Graph Analyzer\n"));

    let targetDir: string;
    let tmpDir: string | null = null;
    const githubInfo = parseGitHubInput(target);

    if (githubInfo) {
      // Remote GitHub repo
      console.log(chalk.white(`  Repository: ${chalk.bold(githubInfo.repoName)}\n`));
      tmpDir = cloneRepo(githubInfo.cloneUrl, githubInfo.repoName);
      targetDir = tmpDir;
    } else {
      // Local directory
      targetDir = path.resolve(target);

      if (!fs.existsSync(targetDir)) {
        console.error(chalk.red(`✖ Directory not found: ${targetDir}`));
        process.exit(1);
      }

      if (!fs.statSync(targetDir).isDirectory()) {
        console.error(chalk.red(`✖ Not a directory: ${targetDir}`));
        process.exit(1);
      }
    }

    console.log(chalk.white(`  Scanning: ${chalk.bold(targetDir)}\n`));

    // Clean up temp dir on exit
    if (tmpDir) {
      const cleanup = () => {
        try { fs.rmSync(tmpDir!, { recursive: true, force: true }); } catch {}
      };
      process.on("exit", cleanup);
      process.on("SIGINT", () => { cleanup(); process.exit(0); });
      process.on("SIGTERM", () => { cleanup(); process.exit(0); });
    }

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
