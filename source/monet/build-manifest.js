import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { classifySeries } from "./series.js";
import { buildPopularity } from "./popularity.js";

const OUT_DIR = process.env.OUT_DIR || "../../docs/monet";

const input = JSON.parse(readFileSync("data/with-images.json", "utf8"));

function buildId(r) {
  if (r.wildenstein) return `w-${r.wildenstein}`;
  return `wd-${r.qid}`;
}

function buildDimensions(r) {
  if (r.height_cm == null || r.width_cm == null) return null;
  return { height_cm: r.height_cm, width_cm: r.width_cm };
}

// Wikidata occasionally has multiple QIDs claiming the same Wildenstein number
// (sometimes true duplicates, sometimes data errors). The first occurrence keeps
// the w-N id; later collisions fall back to wd-Q... so consumers can rely on id uniqueness.
const SOURCE_ORDER = {
  wikidata: 0,
  "commons-wildenstein": 1,
};

function sourceRank(source) {
  return SOURCE_ORDER[source] ?? 99;
}

function metadataScore(p) {
  return [
    p.qid,
    p.year,
    p.dimensions,
    p.collection,
    p.iiif,
    p.title && !/^Q[0-9]+$/.test(p.title),
  ].filter(Boolean).length;
}

function compareRecordQuality(a, b) {
  const sourceDelta = sourceRank(a.source) - sourceRank(b.source);
  if (sourceDelta !== 0) return sourceDelta;

  const metadataDelta = metadataScore(b) - metadataScore(a);
  if (metadataDelta !== 0) return metadataDelta;

  return (b.popularity?.score ?? 0) - (a.popularity?.score ?? 0);
}

function mergeAliases(target, duplicate) {
  const aliases = [...(target.aliases ?? [])];
  aliases.push({
    id: duplicate.id,
    qid: duplicate.qid,
    wildenstein: duplicate.wildenstein,
    source: duplicate.source,
    title: duplicate.title,
  });
  target.aliases = aliases;
}

function dedupeByImage(records) {
  const byImage = new Map();

  for (const record of records) {
    const imageUrl = record.image?.full;
    if (!imageUrl || !byImage.has(imageUrl)) {
      byImage.set(imageUrl, record);
      continue;
    }

    const current = byImage.get(imageUrl);
    if (compareRecordQuality(record, current) < 0) {
      mergeAliases(record, current);
      byImage.set(imageUrl, record);
    } else {
      mergeAliases(current, record);
    }
  }

  return [...byImage.values()];
}

const wSeen = new Set();
const collisions = [];
const paintings = [];
const records = input.records
  .filter((r) => r.image?.thumb && r.image?.full)
  .sort((a, b) => (SOURCE_ORDER[a.source] ?? 99) - (SOURCE_ORDER[b.source] ?? 99));

for (const r of records) {
  if (r.source === "commons-wildenstein" && r.wildenstein && wSeen.has(r.wildenstein)) continue;

  let id = buildId(r);
  if (r.wildenstein && wSeen.has(r.wildenstein)) {
    collisions.push({ wildenstein: r.wildenstein, qid: r.qid });
    id = `wd-${r.qid}`;
  } else if (r.wildenstein) {
    wSeen.add(r.wildenstein);
  }

  paintings.push({
    id,
    qid: r.qid,
    wildenstein: r.wildenstein,
    source: r.source ?? "wikidata",
    title: r.title,
    year: r.year,
    dimensions: buildDimensions(r),
    collection: r.collection,
    series: classifySeries(r.title),
    popularity: buildPopularity(r),
    image: {
      thumb: r.image.thumb,
      full: r.image.full,
      width: r.image.width,
      height: r.image.height,
    },
    iiif: r.iiif,
  });
}

const dedupedPaintings = dedupeByImage(paintings).sort((a, b) => (a.year || "9999").localeCompare(b.year || "9999"));

if (collisions.length) {
  console.warn(`Wildenstein collisions (kept first, fell back to wd-QID for the rest):`);
  for (const c of collisions) console.warn(`  W-${c.wildenstein} → ${c.qid}`);
}

const manifest = {
  generated: new Date().toISOString(),
  count: dedupedPaintings.length,
  paintings: dedupedPaintings,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/manifest.json`, JSON.stringify(manifest, null, 2));

const seriesHist = {};
for (const p of dedupedPaintings) seriesHist[p.series ?? "—"] = (seriesHist[p.series ?? "—"] ?? 0) + 1;
console.log(`Manifest: ${dedupedPaintings.length} paintings → ${OUT_DIR}/manifest.json`);
console.log("Series:", seriesHist);
