import { writeFileSync, mkdirSync } from "node:fs";
import { dataPath, loadArtistConfig, userAgent } from "./config.js";
import { fetchJson } from "./http.js";

const config = loadArtistConfig();
const UA = userAgent(config);
const ENDPOINT = "https://query.wikidata.org/sparql";
const CATALOG = config.catalog ?? null;

function buildMembershipClause() {
  const byArtist = `
    ?item wdt:P170 wd:${config.artist.qid} .
    ?item wdt:P31/wdt:P279* wd:${config.work.qid} .
  `;

  if (!CATALOG?.qid) return byArtist;

  return `
    { ${byArtist} } UNION {
      ?item p:P528 ?stmt0 .
      ?stmt0 pq:P972 wd:${CATALOG.qid} .
    }
  `;
}

function buildCatalogOptional() {
  if (!CATALOG?.qid) return "";
  return `
  OPTIONAL {
    ?item p:P528 ?stmt .
    ?stmt ps:P528 ?catalogNumber ;
          pq:P972 wd:${CATALOG.qid} .
  }`;
}

const QUERY = `
SELECT ?item ?itemLabel ?inception ?width ?height ?collectionLabel ?catalogNumber ?iiif ?image ?sitelinks WHERE {
  ${buildMembershipClause()}
  ?item wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?item wdt:P571 ?inception . }
  OPTIONAL { ?item wdt:P2049 ?width . }
  OPTIONAL { ?item wdt:P2048 ?height . }
  OPTIONAL { ?item wdt:P195 ?collection . }
  ${buildCatalogOptional()}
  OPTIONAL { ?item wdt:P6108 ?iiif . }
  OPTIONAL { ?item wdt:P18 ?image . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
`;

function commonsFilenameFromUrl(url) {
  const m = url.match(/Special:FilePath\/(.+)$/) || url.match(/\/([^\/]+)$/);
  return m ? `File:${decodeURIComponent(m[1])}` : null;
}

function normalizeLabel(value) {
  if (!value || /^https?:\/\/www\.wikidata\.org\/\.well-known\/genid\//.test(value)) return null;
  return value;
}

function normalize(rows) {
  const byItem = new Map();
  for (const row of rows) {
    const qid = row.item.value.split("/").pop();
    if (byItem.has(qid)) continue;
    const catalogNumber = row.catalogNumber?.value || null;
    const catalogField = CATALOG?.fieldName;
    byItem.set(qid, {
      qid,
      title: row.itemLabel?.value || null,
      year: row.inception?.value ? row.inception.value.slice(0, 4) : null,
      height_cm: row.height?.value ? Number(row.height.value) : null,
      width_cm: row.width?.value ? Number(row.width.value) : null,
      collection: normalizeLabel(row.collectionLabel?.value),
      catalog_number: catalogNumber,
      ...(catalogField && catalogNumber ? { [catalogField]: catalogNumber } : {}),
      sitelinks: row.sitelinks?.value ? Number(row.sitelinks.value) : 0,
      iiif: row.iiif?.value || null,
      image_filename: row.image?.value ? commonsFilenameFromUrl(row.image.value) : null,
    });
  }
  return [...byItem.values()];
}

const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(QUERY)}`;
const data = await fetchJson(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
const records = normalize(data.results.bindings);

mkdirSync(process.env.DATA_DIR || "data", { recursive: true });
writeFileSync(dataPath("wikidata.json"), JSON.stringify({ count: records.length, records }, null, 2));
console.log(`Wikidata: ${records.length} ${config.work.label} by ${config.artist.name} → ${dataPath("wikidata.json")}`);
