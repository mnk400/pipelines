import { writeFileSync, mkdirSync } from "node:fs";
import { fetchJson } from "./http.js";
import { isCatalogScan } from "./popularity.js";

const UA = "manik.cc-monet-pipeline/0.1 (https://manik.cc; mnk_400@yahoo.com)";
const API = "https://commons.wikimedia.org/w/api.php";
const PAGE = "Claude Monet catalogue raisonné, 1996 Wildenstein";

function normalizeFileTitle(file) {
  const title = file.trim().replace(/^:/, "");
  return title.startsWith("File:") ? title : `File:${title}`;
}

function parseWildenstein(caption) {
  const clean = caption.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  return clean.match(/^([0-9]+[a-z]?(?:(?:\/|\.|-)[0-9]+[a-z]?)*)/i)?.[1] ?? null;
}

function titleFromFilename(fileTitle, wildenstein) {
  const basename = decodeURIComponent(fileTitle.replace(/^File:/, ""))
    .replace(/\.[^.]+$/, "")
    .replace(/_/g, " ")
    .trim();

  if (isCatalogScan(fileTitle)) return `Wildenstein ${wildenstein}`;
  return basename
    .replace(/^Claude Monet[, -]+/i, "")
    .replace(/^Monet[, -]+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseGalleryRecords(wikitext) {
  // The later "Grandes Décorations" galleries restart numbering at 1, so keep
  // this source scoped to the numbered Wildenstein volumes for now.
  const catalogueText = wikitext.split(/===\s*Les Grandes D[ée]corations/i)[0];
  const records = [];
  const seen = new Set();

  for (const gallery of catalogueText.matchAll(/<gallery\b[^>]*>([\s\S]*?)<\/gallery>/gi)) {
    for (const rawLine of gallery[1].split("\n")) {
      const line = rawLine.replace(/<!--.*?-->/g, "").trim();
      if (!line || !line.includes("|")) continue;

      const separator = line.indexOf("|");
      const fileTitle = normalizeFileTitle(line.slice(0, separator));
      const caption = line.slice(separator + 1).trim();
      if (/File:Noimage\.svg$/i.test(fileTitle)) continue;

      const wildenstein = parseWildenstein(caption);
      if (!wildenstein || seen.has(wildenstein)) continue;
      seen.add(wildenstein);

      records.push({
        source: "commons-wildenstein",
        qid: null,
        title: titleFromFilename(fileTitle, wildenstein),
        year: null,
        height_cm: null,
        width_cm: null,
        collection: null,
        wildenstein,
        sitelinks: 0,
        iiif: null,
        image_filename: fileTitle,
        catalogue_label: caption.replace(/<[^>]+>/g, "").trim(),
      });
    }
  }

  return records;
}

const params = new URLSearchParams({
  action: "parse",
  page: PAGE,
  prop: "wikitext",
  format: "json",
});

const data = await fetchJson(`${API}?${params}`, { headers: { "User-Agent": UA, Accept: "application/json" } });
const wikitext = data.parse?.wikitext?.["*"] ?? "";
const records = parseGalleryRecords(wikitext);

mkdirSync("data", { recursive: true });
writeFileSync("data/commons-wildenstein.json", JSON.stringify({ count: records.length, records }, null, 2));
console.log(`Commons Wildenstein: ${records.length} image-backed entries → data/commons-wildenstein.json`);
