import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dataPath, loadArtistConfig } from "./config.js";
import { classifySeries } from "./series.js";
import { buildPopularity } from "./popularity.js";

const config = loadArtistConfig();
const OUT_DIR = process.env.OUT_DIR || `../../docs/${config.artist.slug ?? config.artist.name.toLowerCase().replace(/\s+/g, "-")}`;

const input = JSON.parse(readFileSync(dataPath("with-images.json"), "utf8"));
const pageviews = existsSync(dataPath("pageviews.json"))
  ? JSON.parse(readFileSync(dataPath("pageviews.json"), "utf8")).records
  : {};

function buildId(r) {
  const catalogNumber = r.catalog_number ?? r.wildenstein;
  if (catalogNumber) return `${config.catalog?.idPrefix ?? "cat"}-${catalogNumber}`;
  if (r.qid) return `wd-${r.qid}`;
  if (r.image_filename) {
    return `commons-${r.image_filename
      .replace(/^File:/, "")
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}`;
  }
  throw new Error(`Cannot build id for record without catalog number, QID, or image filename: ${JSON.stringify(r)}`);
}

function buildDimensions(r) {
  if (r.height_cm == null || r.width_cm == null) return null;
  return { height_cm: r.height_cm, width_cm: r.width_cm };
}

// Wikidata occasionally has multiple QIDs claiming the same catalog number
// (sometimes true duplicates, sometimes data errors). The first occurrence keeps
// the catalog id; later collisions fall back to wd-Q... so consumers can rely on id uniqueness.
const SOURCE_ORDER = {
  wikidata: 0,
  "commons-wildenstein": 1,
  "commons-gallery": 1,
  "commons-category": 2,
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
    catalog_number: duplicate.catalog_number,
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
  const catalogNumber = r.catalog_number ?? r.wildenstein;
  if (r.source === "commons-wildenstein" && catalogNumber && wSeen.has(catalogNumber)) continue;

  let id = buildId(r);
  if (catalogNumber && wSeen.has(catalogNumber)) {
    collisions.push({ catalog_number: catalogNumber, qid: r.qid });
    id = `wd-${r.qid}`;
  } else if (catalogNumber) {
    wSeen.add(catalogNumber);
  }

  paintings.push({
    id,
    qid: r.qid,
    catalog_number: r.catalog_number,
    wildenstein: r.wildenstein,
    source: r.source ?? "wikidata",
    title: r.title,
    year: r.year,
    dimensions: buildDimensions(r),
    collection: r.collection,
    series: classifySeries(r.title, config.seriesRules),
    popularity: buildPopularity({
      pageviews_365d: pageviews[r.qid]?.total_365d ?? 0,
      sitelinks: r.sitelinks,
      commons_globalusage: r.commons_globalusage,
    }),
    image: {
      thumb: r.image.thumb,
      full: r.image.full,
      width: r.image.width,
      height: r.image.height,
      license: r.image.license,
    },
    iiif: r.iiif,
  });
}

function comparePaintings(a, b) {
  return (
    (a.year || "9999").localeCompare(b.year || "9999") ||
    (a.title || "").localeCompare(b.title || "") ||
    a.id.localeCompare(b.id)
  );
}

const dedupedPaintings = dedupeByImage(paintings).sort(comparePaintings);

if (collisions.length) {
  console.warn(`Catalog number collisions (kept first, fell back to wd-QID for the rest):`);
  for (const c of collisions) console.warn(`  ${c.catalog_number} → ${c.qid}`);
}

const manifest = {
  generated: new Date().toISOString(),
  artist: config.artist,
  work: config.work,
  count: dedupedPaintings.length,
  [config.work.manifestKey]: dedupedPaintings,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/manifest.json`, JSON.stringify(manifest, null, 2));

const seriesHist = {};
for (const p of dedupedPaintings) seriesHist[p.series ?? "—"] = (seriesHist[p.series ?? "—"] ?? 0) + 1;
console.log(`Manifest: ${dedupedPaintings.length} ${config.work.label} → ${OUT_DIR}/manifest.json`);
console.log("Series:", seriesHist);
