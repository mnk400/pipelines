import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { classifySeries } from "./series.js";

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
const wSeen = new Set();
const collisions = [];
const paintings = input.records
  .filter((r) => r.image?.thumb && r.image?.full)
  .map((r) => {
    let id = buildId(r);
    if (r.wildenstein && wSeen.has(r.wildenstein)) {
      collisions.push({ wildenstein: r.wildenstein, qid: r.qid });
      id = `wd-${r.qid}`;
    } else if (r.wildenstein) {
      wSeen.add(r.wildenstein);
    }
    return {
      id,
      qid: r.qid,
      wildenstein: r.wildenstein,
      title: r.title,
      year: r.year,
      dimensions: buildDimensions(r),
      collection: r.collection,
      series: classifySeries(r.title),
      popularity: {
        sitelinks: r.sitelinks ?? 0,
      },
      image: {
        thumb: r.image.thumb,
        full: r.image.full,
        width: r.image.width,
        height: r.image.height,
      },
      iiif: r.iiif,
    };
  })
  .sort((a, b) => (a.year || "9999").localeCompare(b.year || "9999"));

if (collisions.length) {
  console.warn(`Wildenstein collisions (kept first, fell back to wd-QID for the rest):`);
  for (const c of collisions) console.warn(`  W-${c.wildenstein} → ${c.qid}`);
}

const manifest = {
  generated: new Date().toISOString(),
  count: paintings.length,
  paintings,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/manifest.json`, JSON.stringify(manifest, null, 2));

const seriesHist = {};
for (const p of paintings) seriesHist[p.series ?? "—"] = (seriesHist[p.series ?? "—"] ?? 0) + 1;
console.log(`Manifest: ${paintings.length} paintings → ${OUT_DIR}/manifest.json`);
console.log("Series:", seriesHist);
