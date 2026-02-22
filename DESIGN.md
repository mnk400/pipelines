# CDN — Design

Personal asset hosting via GitHub Pages + Cloudflare. Raw sources go in, processed outputs get served at `manik.cc/cdn/`.

## Structure

```
cdn/
├── pipeline/
│   ├── image.sh               ← default: WebP, thumbnails, EXIF, manifest
│   └── lastfm.sh              ← custom: fetch, analyze, export
├── source/
│   ├── photos/                ← no .pipeline → uses image.sh
│   │   ├── metadata.json      ← manual captions/alt text
│   │   └── img001.jpg
│   ├── art/                   ← no .pipeline → uses image.sh
│   └── lastfm-stats/
│       ├── .pipeline           ← contains: lastfm
│       ├── fetch-data.js
│       └── ...
├── docs/                      ← GitHub Pages serves this
│   ├── photos/
│   │   ├── manifest.json
│   │   ├── thumb/
│   │   └── full/
│   └── lastfm-stats/
│       ├── manifest.json
│       └── processed/
└── .github/workflows/
    ├── build.yml              ← on push — runs pipelines
    └── refresh-lastfm.yml     ← cron — monthly Last.fm fetch
```

Each top-level folder under `source/` is a **project**. A project maps 1:1 to a consumer (a page, a blog post, a tool).

## Pipelines

All pipeline scripts live in `pipeline/` at the repo root. Each project selects its pipeline via a `.pipeline` file in its source directory. No `.pipeline` file means use `image` (the default).

```
for each changed project in source/:
  name = read source/<project>/.pipeline || "image"
  run pipeline/${name}.sh <project>
```

Each pipeline script receives the project name as an argument so it knows which `source/<project>/` to read and `docs/<project>/` to write. This keeps pipelines reusable — multiple projects can point to the same pipeline.

### image.sh (default)

Runs for any project without a `.pipeline` file:

1. Convert originals to WebP (full-res) → `docs/<project>/full/`
2. Generate thumbnails (bounded to ~400px wide) → `docs/<project>/thumb/`
3. Extract EXIF metadata from originals (camera, focal length, aperture, ISO, date)
4. Merge with manual `metadata.json` from `source/<project>/` (captions, alt text)
5. Write `manifest.json`

### Custom pipelines

Project-specific processing. Example: `lastfm.sh` runs the fetch/analyze/export scripts and writes processed JSON to `docs/<project>/processed/`. Custom pipelines are responsible for writing their own `manifest.json`.

## Manifest

Every project has a `manifest.json` at its root in `docs/`. It is the single source of truth for what the project contains. Consumers fetch the manifest and construct URLs from it.

### Gallery manifest

```json
{
  "type": "gallery",
  "dirs": ["thumb", "full"],
  "items": [
    {
      "name": "img001",
      "ext": "webp",
      "width": 4000,
      "height": 2667,
      "caption": "Shibuya crossing at night",
      "alt": "Crowded intersection with neon signs",
      "date": "2024-03-15",
      "exif": {
        "camera": "Ricoh GR III",
        "focal": "18.3mm",
        "aperture": "f/2.8",
        "iso": 800
      }
    }
  ]
}
```

URLs are predictable from the manifest: `thumb/img001.webp`, `full/img001.webp`.

### Data manifest

```json
{
  "type": "data",
  "files": [
    { "name": "genre-drift.json", "dir": "processed", "description": "Monthly genre breakdown" },
    { "name": "3am-analysis.json", "dir": "processed", "description": "Hourly listening patterns" },
    { "name": "mainstream-analysis.json", "dir": "processed", "description": "Obscurity trends" }
  ]
}
```

## Workflows

### build.yml (on push)

Triggers on any push to `source/`. Detects which project folders changed, reads each project's `.pipeline` (or defaults to `image`), and runs `pipeline/<name>.sh <project>`. Commits results to `docs/` and pushes.

### Scheduled workflows (per-project, only when needed)

Project-specific cron jobs for things that fetch external data. Example: `refresh-lastfm.yml` hits the Last.fm API monthly, commits new data to `source/lastfm-stats/`, which triggers `build.yml` to process and export.

Most projects won't need a scheduled workflow — they're push-only (you add files, the build pipeline does the rest).

## Adding content

### Photos (manual push or iOS Shortcut)

1. Drop images into `source/<project>/`
2. Optionally add/update `source/<project>/metadata.json` for captions
3. Push (or iOS Shortcut commits via GitHub API)
4. `build.yml` detects changes, runs `image.sh`, deploys to `docs/`

### Data (scheduled)

1. Cron workflow fetches from external API, commits to `source/<project>/`
2. Push triggers `build.yml`, which runs the project's custom pipeline
3. Processed output lands in `docs/`

## Serving

- GitHub Pages serves `docs/` at `manik.cc/cdn/`
- Cloudflare sits in front for caching, compression, and CORS
- URLs are predictable: `manik.cc/cdn/<project>/manifest.json`
