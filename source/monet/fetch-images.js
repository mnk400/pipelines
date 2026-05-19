import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fetchJson } from "./http.js";

const UA = "manik.cc-monet-pipeline/0.1 (https://manik.cc; mnk_400@yahoo.com)";
const API = "https://commons.wikimedia.org/w/api.php";
const THUMB_WIDTH = 600;
const BATCH_SIZE = 50;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripUtm = (url) => url?.replace(/\?utm_[^#]*/, "") ?? url;

async function imageinfo(titles) {
  const out = {};
  const normalized = [];
  let continuation = {};

  do {
    const params = new URLSearchParams({
      action: "query",
      titles: titles.join("|"),
      prop: "imageinfo|globalusage",
      iiprop: "url|size|mime",
      iiurlwidth: String(THUMB_WIDTH),
      gulimit: "max",
      format: "json",
      ...continuation,
    });
    const data = await fetchJson(`${API}?${params}`, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (data.query?.pages) {
      for (const p of Object.values(data.query.pages)) {
        out[p.title] ??= { commons_globalusage: 0 };
        out[p.title].commons_globalusage += p.globalusage?.length ?? 0;
        const ii = p.imageinfo?.[0];
        if (ii) {
          out[p.title] = {
            ...out[p.title],
            thumb: stripUtm(ii.thumburl),
            full: stripUtm(ii.url),
            width: ii.width,
            height: ii.height,
          };
        }
      }
    }
    if (data.query?.normalized) normalized.push(...data.query.normalized);
    continuation = data.continue ?? null;
  } while (continuation);

  // The MediaWiki API normalizes titles; reuse the normalization map so callers
  // can look up by their original title string.
  for (const n of normalized) {
    if (out[n.to]) out[n.from] = out[n.to];
  }
  return out;
}

const wd = JSON.parse(readFileSync("data/wikidata.json", "utf8"));
const commons = existsSync("data/commons-wildenstein.json")
  ? JSON.parse(readFileSync("data/commons-wildenstein.json", "utf8"))
  : { records: [] };
const wikidataByWildenstein = new Map();
const wikidataWithImages = new Set();
for (const r of wd.records) {
  if (r.wildenstein && !wikidataByWildenstein.has(r.wildenstein)) wikidataByWildenstein.set(r.wildenstein, r);
  if (r.wildenstein && r.image_filename) wikidataWithImages.add(r.wildenstein);
}
const commonsFallbacks = commons.records
  .filter((r) => !r.wildenstein || !wikidataWithImages.has(r.wildenstein))
  .map((r) => {
    const wikidata = wikidataByWildenstein.get(r.wildenstein);
    if (!wikidata) return r;
    return {
      ...wikidata,
      source: "commons-wildenstein",
      image_filename: r.image_filename,
      catalogue_label: r.catalogue_label,
      commons_title: r.title,
    };
  });
const inputRecords = [
  ...wd.records.map((r) => ({ ...r, source: "wikidata" })),
  ...commonsFallbacks,
];
const withFilename = inputRecords.filter((r) => r.image_filename);

const records = [];
for (let i = 0; i < withFilename.length; i += BATCH_SIZE) {
  const batch = withFilename.slice(i, i + BATCH_SIZE);
  const info = await imageinfo(batch.map((r) => r.image_filename));
  for (const r of batch) {
    const meta = info[r.image_filename];
    if (meta?.thumb && meta?.full) {
      records.push({
        ...r,
        commons_globalusage: meta.commons_globalusage ?? 0,
        image: {
          thumb: meta.thumb,
          full: meta.full,
          width: meta.width,
          height: meta.height,
        },
      });
    }
  }
  process.stdout.write(`\rImages: ${records.length}/${withFilename.length}`);
  await sleep(150);
}
process.stdout.write("\n");

writeFileSync("data/with-images.json", JSON.stringify({ count: records.length, records }, null, 2));
console.log(`Images: ${records.length}/${withFilename.length} resolved → data/with-images.json`);
