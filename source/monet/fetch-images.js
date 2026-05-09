import { readFileSync, writeFileSync } from "node:fs";
import { fetchJson } from "./http.js";

const UA = "manik.cc-monet-pipeline/0.1 (https://manik.cc; mnk_400@yahoo.com)";
const API = "https://commons.wikimedia.org/w/api.php";
const THUMB_WIDTH = 600;
const BATCH_SIZE = 50;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripUtm = (url) => url?.replace(/\?utm_[^#]*/, "") ?? url;

async function imageinfo(titles) {
  const params = new URLSearchParams({
    action: "query",
    titles: titles.join("|"),
    prop: "imageinfo",
    iiprop: "url|size|mime",
    iiurlwidth: String(THUMB_WIDTH),
    format: "json",
  });
  const data = await fetchJson(`${API}?${params}`, { headers: { "User-Agent": UA, Accept: "application/json" } });
  const out = {};
  if (data.query?.pages) {
    for (const p of Object.values(data.query.pages)) {
      const ii = p.imageinfo?.[0];
      if (ii) out[p.title] = { thumb: stripUtm(ii.thumburl), full: stripUtm(ii.url), width: ii.width, height: ii.height };
    }
  }
  // The MediaWiki API normalizes titles — reuse the normalization map so callers
  // can look up by their original title string.
  if (data.query?.normalized) {
    for (const n of data.query.normalized) {
      if (out[n.to]) out[n.from] = out[n.to];
    }
  }
  return out;
}

const wd = JSON.parse(readFileSync("data/wikidata.json", "utf8"));
const withFilename = wd.records.filter((r) => r.image_filename);

const records = [];
for (let i = 0; i < withFilename.length; i += BATCH_SIZE) {
  const batch = withFilename.slice(i, i + BATCH_SIZE);
  const info = await imageinfo(batch.map((r) => r.image_filename));
  for (const r of batch) {
    const meta = info[r.image_filename];
    if (meta) records.push({ ...r, image: { thumb: meta.thumb, full: meta.full } });
  }
  process.stdout.write(`\rImages: ${records.length}/${withFilename.length}`);
  await sleep(150);
}
process.stdout.write("\n");

writeFileSync("data/with-images.json", JSON.stringify({ count: records.length, records }, null, 2));
console.log(`Images: ${records.length} resolved → data/with-images.json`);
