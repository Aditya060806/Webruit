<div align="center">

<img src="packages/browseros-agent/apps/app/assets/product_logo.svg" alt="Webruit" width="96" />

<h1>Webruit</h1>

<h3>An AI browser with companions that do the work for you.</h3>

Open source · Runs on your machine with your own model keys · AGPL-3.0

</div>

> **Status: early development.** Webruit is a fork of [BrowserOS](https://github.com/browseros-ai/BrowserOS). There are no Webruit installers yet; you run it as a dev build on top of an installed BrowserOS.

## What it is

Webruit is a Chromium browser with a built-in agent that can read pages, click, type, fill forms, manage tabs and use your connected apps. You give it a task in the side panel and it does the work in your browser, where you can watch it.

The agent runs locally by default, using a model provider you choose (OpenAI, Anthropic, Gemini, OpenRouter, Ollama, LM Studio and others). An optional Webruit Cloud runner for always-on tasks is planned.

### Companions

Companions are named agents, each set up for a kind of work. Every companion has its own persona, starter tasks, effort level, preferred apps and limits on which tools and sites it may use.

| Companion | For |
|---|---|
| **Webruit** | General browsing tasks |
| **Atlas** | Research, with results going into Sheets and Drive |
| **Quill** | Writing and outreach |
| **Relay** | Operations and repetitive admin |

Pick a companion from the side-panel header, or create and edit your own on the **Companions** page. Companions are stored as plain files (`companion.json` + `persona.md`) under your profile's `companions/` folder, so you can also edit them by hand.

## Roadmap

| Milestone | Status |
|---|---|
| M0 Rebrand to Webruit (agent layer) | Done |
| M1 Companions | Done |
| M2 Research companies → Google Sheets workflow | Next |
| M3 Take over / stop / hand back control of a tab | Planned |
| M4 Permission tiers and approval rules | Planned |
| M5 Memory | Planned |
| M6 Routines (scheduled and triggered tasks, cloud runner) | Planned |
| M7 Meeting transcription | Planned |
| M8 Visual artifacts (decks, images) | Planned |
| M9 Optional accounts and usage credits | Planned |

## Development

The Webruit code lives in [`packages/browseros-agent`](packages/browseros-agent): a Bun monorepo with the agent server (`apps/server`), the browser extension UI (`apps/app`) and shared packages.

```bash
cd packages/browseros-agent
bun install
bun run check
bun run test
```

On macOS and Linux, `bun run dev:watch -- --new` starts a dev browser with the extension and server. That tool does not run on Windows. On Windows:

1. Install BrowserOS.
2. Build the extension: `cd apps/app && bun run build`.
3. Start the server: `bun apps/server/src/index.ts --config <config.json>`.
4. Launch BrowserOS with `--remote-debugging-port=<port> --disable-browseros-server --disable-browseros-extensions --load-extension=<path to apps/app/dist/chrome-mv3>`.
5. Set the `browseros.server.mcp_port` pref to the server port. It resets when the browser restarts.

## License and credits

Webruit is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE). It is a modified version of BrowserOS by its contributors; see [NOTICE](NOTICE) for attribution and the list of changes, and [README.BrowserOS.md](README.BrowserOS.md) for the upstream project's README. The Chromium layer also carries the licenses in [LICENSE.ungoogled_chromium](LICENSE.ungoogled_chromium).

Webruit is not affiliated with or endorsed by the BrowserOS project.
