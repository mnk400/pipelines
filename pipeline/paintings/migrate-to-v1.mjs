// One-off: rewrite docs/paintings/<artist>/manifest.json from v0 to v1.
// After this runs, build-manifest.js takes over for future runs.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const DOCS_DIR = "../../docs/paintings";

function toV1Item(p) {
  const meta = {};
  if (p.collection) meta.Collection = p.collection;
  if (p.series) meta.Series = p.series;

  const extras = {};
  if (p.qid) extras.qid = p.qid;
  if (p.catalog_number) extras.catalog_number = p.catalog_number;
  if (p.wildenstein) extras.wildenstein = p.wildenstein;
  if (p.source) extras.source = p.source;
  if (p.dimensions) extras.dimensions = p.dimensions;
  if (p.iiif) extras.iiif = p.iiif;
  if (p.image?.license) extras.license = p.image.license;
  if (p.aliases) extras.aliases = p.aliases;

  return {
    id: p.id,
    title: p.title,
    year: p.year,
    thumb: p.image.thumb,
    full: p.image.full,
    width: p.image.width,
    height: p.image.height,
    tags: [],
    popularity: p.popularity,
    meta,
    extras,
  };
}

function transform(v0) {
  const items = (v0[v0.work?.manifestKey ?? "paintings"] ?? []).map(toV1Item);
  return {
    version: 1,
    name: v0.artist?.name ?? "",
    items,
    source: {
      generator: "pipelines-paintings",
      generated: v0.generated ?? new Date().toISOString(),
      artist: v0.artist,
      work: v0.work,
      count: items.length,
    },
  };
}

const artists = readdirSync(DOCS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const slug of artists) {
  const path = `${DOCS_DIR}/${slug}/manifest.json`;
  const v0 = JSON.parse(readFileSync(path, "utf8"));
  if (v0.version === 1) {
    console.log(`${slug}: already v1, skipping`);
    continue;
  }
  const v1 = transform(v0);
  writeFileSync(path, JSON.stringify(v1, null, 2));
  console.log(`${slug}: ${v1.items.length} items → v1`);
}
