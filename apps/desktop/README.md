# AgentX Desktop

Native macOS and Windows apps — a lightweight [Tauri 2](https://tauri.app) shell (~10 MB) around the AgentX web app.

## Build locally

Prerequisites: Rust ≥ 1.85 and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
cd apps/desktop
npx @tauri-apps/cli dev     # run in dev
npx @tauri-apps/cli build   # produce installers (dmg / msi / exe)
```

By default the app loads the hosted instance (`https://agentx-platform.netlify.app`). To point it at your own deployment, change `app.windows[0].url` in [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) and rebuild.

## Release builds (CI)

Pushing a tag `desktop-v*` triggers [`.github/workflows/desktop-release.yml`](../../.github/workflows/desktop-release.yml), which builds **macOS (universal)** and **Windows** installers on GitHub Actions (free for public repos) and attaches them to a draft GitHub Release:

```bash
git tag desktop-v0.1.0 && git push --tags
```
