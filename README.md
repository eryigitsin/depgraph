# depgraph

> A local CLI tool that parses `import` / `require` statements and creates an interactive dependency graph visualization.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff)
![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=000)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=fff)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=fff)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

---

## Features

- **Parses** ES imports, dynamic `import()`, and CommonJS `require()` statements
- **Supports** `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.vue`, `.svelte` files
- **Classifies** dependencies as local files, npm packages, or Node.js built-ins
- **Renders** an interactive, zoomable force-directed graph using `react-force-graph-2d`
- **Includes** search, filter by type, hover tooltips, and click-to-zoom
- **Fully offline** — no external API calls

---

## Prerequisites

- **Node.js** `>= 18`
- **npm** `>= 9`

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/eryigitsin/depgraph.git
cd depgraph
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build the project

```bash
npm run build
```

> This compiles the CLI (`tsc`) and bundles the React UI (`vite build`).

### 4. (Optional) Link globally

```bash
npm link
```

Now you can run `depgraph` from anywhere.

---

## Usage

### Analyze a project directory

```bash
# Point it at the current directory
node dist/cli.js .

# Or specify a path
node dist/cli.js /path/to/your/project

# If linked globally
depgraph /path/to/your/project
```

This will:
1. Scan all source files
2. Parse import/require statements
3. Start a local server and open an interactive graph in your browser

### CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --port <number>` | Port for the visualization server | `3000` |
| `-j, --json` | Output graph data as JSON (no server) | — |
| `--no-packages` | Exclude npm package dependencies | — |
| `--no-builtins` | Exclude Node.js built-in modules | — |
| `-V, --version` | Show version number | — |
| `-h, --help` | Show help | — |

### Examples

```bash
# Custom port
node dist/cli.js . --port 8080

# JSON output only
node dist/cli.js . --json

# Local files only (no packages or builtins)
node dist/cli.js . --no-packages --no-builtins
```

---

## Graph Legend

| Color | Meaning |
|-------|---------|
| 🔵 Blue | Local `.ts` files |
| 🟦 Teal | Local `.tsx` files |
| 🟡 Yellow | Local `.js` / `.mjs` / `.cjs` files |
| 🟠 Orange | npm packages |
| 🟣 Purple | Node.js built-in modules |

---

## Tech Stack

| Tool | Purpose |
|------|---------|
| **React** | UI framework |
| **TypeScript** | Type safety |
| **Vite** | Bundling |
| **react-force-graph-2d** | Graph rendering |
| **Commander** | CLI argument parsing |
| **Chalk** | Colored terminal output |

---

## Project Structure

```
depgraph/
├── src/
│   ├── cli.ts            # CLI entry point
│   ├── parser.ts         # Import/require parser & file walker
│   ├── server.ts         # Local HTTP server
│   └── ui/
│       ├── index.html    # HTML shell
│       ├── main.tsx      # React entry
│       └── App.tsx       # Graph UI component
├── tsconfig.json         # TypeScript config (UI)
├── tsconfig.cli.json     # TypeScript config (CLI)
├── vite.config.ts        # Vite config
└── package.json
```

---

## License

MIT

---

## Credits

You can use this repo freely by simply giving credits to me:
**[https://github.com/eryigitsin](https://github.com/eryigitsin)**
