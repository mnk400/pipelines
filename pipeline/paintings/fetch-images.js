import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dataPath, loadArtistConfig, userAgent } from "./config.js";
import { fetchJson } from "./http.js";

const config = loadArtistConfig();
const UA = userAgent(config);
const API = "https://commons.wikimedia.org/w/api.php";
const THUMB_WIDTH = 600;
const BATCH_SIZE = 50;
const BATCH_THROTTLE_MS = Number(process.env.PAINTINGS_IMAGE_BATCH_THROTTLE_MS || 750);

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
      iiprop: "url|size|mime|extmetadata",
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
            license: {
              short_name: ii.extmetadata?.LicenseShortName?.value ?? null,
              url: ii.extmetadata?.LicenseUrl?.value ?? null,
              usage_terms: ii.extmetadata?.UsageTerms?.value ?? null,
              credit: ii.extmetadata?.Credit?.value ?? null,
              artist: ii.extmetadata?.Artist?.value ?? null,
            },
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

const wd = JSON.parse(readFileSync(dataPath("wikidata.json"), "utf8"));
const commons = existsSync(dataPath("commons-gallery.json"))
  ? JSON.parse(readFileSync(dataPath("commons-gallery.json"), "utf8"))
  : { records: [] };
const wikidataByCatalogNumber = new Map();
const wikidataByImageFilename = new Map();
const wikidataWithImages = new Set();
const wikidataFilenames = new Set();
for (const r of wd.records) {
  const catalogNumber = r.catalog_number ?? r.wildenstein;
  if (catalogNumber && !wikidataByCatalogNumber.has(catalogNumber)) wikidataByCatalogNumber.set(catalogNumber, r);
  if (catalogNumber && r.image_filename) wikidataWithImages.add(catalogNumber);
  if (r.image_filename) {
    wikidataFilenames.add(r.image_filename);
    if (!wikidataByImageFilename.has(r.image_filename)) wikidataByImageFilename.set(r.image_filename, r);
  }
}

// Drop commons records whose image is already covered by a wikidata record
// (either via shared catalog number OR shared Commons filename) — otherwise
// we'd carry duplicate canvases through to manifest dedupe with weaker metadata.
const commonsFallbacks = commons.records
  .filter((r) => {
    const catalogNumber = r.catalog_number ?? r.wildenstein;
    if (catalogNumber && wikidataWithImages.has(catalogNumber)) return false;
    if (r.image_filename && wikidataFilenames.has(r.image_filename)) return false;
    return true;
  })
  .map((r) => {
    const catalogNumber = r.catalog_number ?? r.wildenstein;
    const wikidata =
      wikidataByCatalogNumber.get(catalogNumber) ?? wikidataByImageFilename.get(r.image_filename);
    if (!wikidata) return r;
    return {
      ...wikidata,
      source: r.source ?? "commons-gallery",
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
          license: meta.license,
        },
      });
    }
  }
  process.stdout.write(`\rImages: ${records.length}/${withFilename.length}`);
  await sleep(BATCH_THROTTLE_MS);
}
process.stdout.write("\n");

writeFileSync(dataPath("with-images.json"), JSON.stringify({ count: records.length, records }, null, 2));
console.log(`Images: ${records.length}/${withFilename.length} resolved → ${dataPath("with-images.json")}`);
