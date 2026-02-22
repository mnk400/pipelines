# cdn

Personal asset hosting. Raw sources go into `source/`, pipelines process them, and `docs/` gets served via GitHub Pages at **manik.cc/cdn/**.

## How it works

Each folder under `source/` is a **project** (maps to a page, blog post, or really any project anywhere). When you push changes, a GitHub Action detects which projects changed, runs the right pipeline, and commits processed output to `docs/`.

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
| *(no file)* or `image` | `pipeline/image.sh` | WebP conversion, thumbnails, EXIF extraction, manifest |
| `lastfm` | `pipeline/lastfm.sh` | Fetch Last.fm API, analyze listening data, export JSON |

To add a new pipeline, create `pipeline/<name>.sh`. It receives the project name as `$1` and should read from `source/$1/` and write to `docs/$1/`.

## Adding a project

**Image gallery** (photos, art, blog images):

```bash
mkdir source/my-gallery
cp *.jpg source/my-gallery/
git add source/my-gallery && git commit -m "Add my-gallery" && git push
# build.yml runs image.sh → docs/my-gallery/ appears with thumbs + manifest
```

**Custom pipeline**:

```bash
mkdir source/my-project
echo "my-pipeline" > source/my-project/.pipeline
# add source files and scripts...
```

## Workflows

- **`build.yml`** — triggers on push to `source/**`. Detects changed projects, runs their pipelines, commits `docs/`.
- **`refresh-lastfm.yml`** — monthly cron (1st of month) + manual trigger. Fetches new Last.fm data, runs the full pipeline, commits both `source/` and `docs/`.

Projects that fetch external data get their own scheduled workflow. Most projects are push-only.

## Current projects

| Project | Pipeline | Schedule | URL |
|---|---|---|---|
| `lastfm-stats` | `lastfm` | Monthly | [manik.cc/cdn/lastfm-stats/](https://manik.cc/cdn/lastfm-stats/manifest.json) |

## URLs

All output is served at `https://manik.cc/cdn/<project>/`:

```
manik.cc/cdn/lastfm-stats/manifest.json
manik.cc/cdn/lastfm-stats/processed/genre-drift.json
manik.cc/cdn/lastfm-stats/processed/3am-analysis.json
manik.cc/cdn/lastfm-stats/processed/mainstream-analysis.json
```

GitHub Pages serves `docs/`, Cloudflare handles caching and CORS.
