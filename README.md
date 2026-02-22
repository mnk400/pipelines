# pipelines

Hacked together asset hosting and automated data pipelines for personal projects. In Git because it allows for version control out-of-the-gate. Raw sources go into `source/`, pipelines process them, and `docs/` gets served via GitHub Pages at **manik.cc/pipelines/**.

Some projects are static assets processed once, others are living datasets that refresh on a schedule; fetching external APIs, processing data, and committing updated output automatically. Either way, the pattern is the same: source in, pipeline runs, `docs/` serves.

## How it works

Each folder under `source/` is a **project** (maps to a page, blog post, or really any project anywhere). When a change is pushed, a GitHub Action detects which projects changed, runs the right pipeline, and commits processed output to `docs/`.

```
source/<project>/     →  pipeline/<name>.sh  →  docs/<project>/
                                                  ├── manifest.json
                                                  └── ...
```

Every project gets a `manifest.json` in `docs/` — the single source of truth for what it contains. Consumers fetch the manifest and construct URLs from it.

## Pipelines

Pipeline scripts live in `pipeline/`. Each project picks its pipeline via a `.pipeline` file:

| `.pipeline` contents | Script | What it does |
|---|---|---|
| `lastfm` | `pipeline/lastfm.sh` | Fetch Last.fm API, analyze listening data, export JSON |

To add a new pipeline, create `pipeline/<name>.sh`. It receives the project name as `$1` and should read from `source/$1/` and write to `docs/$1/`.

## Adding a project

**Custom pipeline**:

```bash
mkdir source/my-project
echo "my-pipeline" > source/my-project/.pipeline
# add source files and scripts...
```

## Workflows

- **`build.yml`** — triggers on push to `source/**`, `pipeline/**`, or `.github/workflows/**`. Detects changed projects, runs their pipelines, commits `docs/`. Falls back to rebuilding all projects when pipeline or workflow files change.
- **`refresh-lastfm.yml`** — monthly cron (1st of month) + manual trigger. Fetches new Last.fm data, runs the full pipeline, commits both `source/` and `docs/`.

Projects that fetch external data get their own scheduled workflow. Most projects are push-only.

## URLs

All output is served at `https://manik.cc/pipelines/<project>/`:

```
manik.cc/pipelines/lastfm-stats/manifest.json
```

GitHub Pages serves `docs/`, Cloudflare handles caching and CORS.
