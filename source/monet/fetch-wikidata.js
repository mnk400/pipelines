import { writeFileSync, mkdirSync } from "node:fs";
import { fetchJson } from "./http.js";

const UA = "manik.cc-monet-pipeline/0.1 (https://manik.cc; mnk_400@yahoo.com)";
const ENDPOINT = "https://query.wikidata.org/sparql";

// Wildenstein numbers live under P528 (catalog code) qualified by P972 (catalog)
// pointing to "Monet: Catalogue Raisonné" (Q17441029). The naively-named property
// P5396 ("Wildenstein index number for Monet paintings") exists but has zero values.
const WILDENSTEIN_CATALOG = "Q17441029";

const QUERY = `
SELECT ?item ?itemLabel ?inception ?width ?height ?collectionLabel ?wildenstein ?iiif ?image WHERE {
  ?item wdt:P170 wd:Q296 .
  ?item wdt:P31 wd:Q3305213 .
  OPTIONAL { ?item wdt:P571 ?inception . }
  OPTIONAL { ?item wdt:P2049 ?width . }
  OPTIONAL { ?item wdt:P2048 ?height . }
  OPTIONAL { ?item wdt:P195 ?collection . }
  OPTIONAL {
    ?item p:P528 ?stmt .
    ?stmt ps:P528 ?wildenstein ;
          pq:P972 wd:${WILDENSTEIN_CATALOG} .
  }
  OPTIONAL { ?item wdt:P6108 ?iiif . }
  OPTIONAL { ?item wdt:P18 ?image . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
`;

function commonsFilenameFromUrl(url) {
  const m = url.match(/Special:FilePath\/(.+)$/) || url.match(/\/([^\/]+)$/);
  return m ? `File:${decodeURIComponent(m[1])}` : null;
}

function normalize(rows) {
  const byItem = new Map();
  for (const row of rows) {
    const qid = row.item.value.split("/").pop();
    if (byItem.has(qid)) continue;
    byItem.set(qid, {
      qid,
      title: row.itemLabel?.value || null,
      year: row.inception?.value ? row.inception.value.slice(0, 4) : null,
      height_cm: row.height?.value ? Number(row.height.value) : null,
      width_cm: row.width?.value ? Number(row.width.value) : null,
      collection: row.collectionLabel?.value || null,
      wildenstein: row.wildenstein?.value || null,
      iiif: row.iiif?.value || null,
      image_filename: row.image?.value ? commonsFilenameFromUrl(row.image.value) : null,
    });
  }
  return [...byItem.values()];
}

const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(QUERY)}`;
const data = await fetchJson(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
const records = normalize(data.results.bindings);

mkdirSync("data", { recursive: true });
writeFileSync("data/wikidata.json", JSON.stringify({ count: records.length, records }, null, 2));
console.log(`Wikidata: ${records.length} paintings → data/wikidata.json`);
