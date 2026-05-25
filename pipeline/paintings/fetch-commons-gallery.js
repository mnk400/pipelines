import { writeFileSync, mkdirSync } from "node:fs";
import { dataPath, loadArtistConfig, userAgent } from "./config.js";
import { fetchJson } from "./http.js";

const config = loadArtistConfig();
const UA = userAgent(config);
const API = "https://commons.wikimedia.org/w/api.php";
const galleryConfig = config.commonsGallery;
const categoryConfig = config.commonsCategory;
const OUT = dataPath("commons-gallery.json");

function normalizeFileTitle(file) {
  const title = file.trim().replace(/^:/, "");
  return title.startsWith("File:") ? title : `File:${title}`;
}

function parseCatalogNumber(caption) {
  const clean = caption.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  const pattern = galleryConfig?.catalogNumberPattern ?? "^([0-9]+[a-z]?(?:(?:/|\\.|-)[0-9]+[a-z]?)*)";
  return clean.match(new RegExp(pattern, "i"))?.[1] ?? null;
}

function isCatalogScan(fileTitle) {
  const pattern = galleryConfig.catalogScanPattern ?? "(?:^|[ _-])Wildenstein[ _-]1996";
  return new RegExp(pattern, "i").test(fileTitle);
}

function titleFromFilename(fileTitle, catalogNumber) {
  const basename = decodeURIComponent(fileTitle.replace(/^File:/, ""))
    .replace(/\.[^.]+$/, "")
    .replace(/_/g, " ")
    .trim();

  if (isCatalogScan(fileTitle)) return `${galleryConfig.catalogLabel ?? "Catalog"} ${catalogNumber}`;

  return (galleryConfig.titleStripPatterns ?? [])
    .reduce((title, pattern) => title.replace(new RegExp(pattern, "i"), ""), basename)
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromCategoryFile(fileTitle) {
  const basename = decodeURIComponent(fileTitle.replace(/^File:/, ""))
    .replace(/\.[^.]+$/, "")
    .replace(/_/g, " ")
    .trim();

  return (categoryConfig.titleStripPatterns ?? [])
    .reduce((title, pattern) => title.replace(new RegExp(pattern, "i"), ""), basename)
    .replace(/\s+/g, " ")
    .trim();
}

function shouldSkipCategoryFile(fileTitle) {
  return (categoryConfig.excludeFilePatterns ?? []).some((pattern) => new RegExp(pattern, "i").test(fileTitle));
}

function parseGalleryRecords(wikitext) {
  const catalogueText = galleryConfig.stopBeforePattern
    ? wikitext.split(new RegExp(galleryConfig.stopBeforePattern, "i"))[0]
    : wikitext;
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

      const catalogNumber = parseCatalogNumber(caption);
      if (!catalogNumber || seen.has(catalogNumber)) continue;
      seen.add(catalogNumber);
      const catalogField = config.catalog?.fieldName;

      records.push({
        source: galleryConfig.sourceName ?? "commons-gallery",
        qid: null,
        title: titleFromFilename(fileTitle, catalogNumber),
        year: null,
        height_cm: null,
        width_cm: null,
        collection: null,
        catalog_number: catalogNumber,
        ...(catalogField ? { [catalogField]: catalogNumber } : {}),
        sitelinks: 0,
        iiif: null,
        image_filename: fileTitle,
        catalogue_label: caption.replace(/<[^>]+>/g, "").trim(),
      });
    }
  }

  return records;
}

async function fetchGalleryRecords() {
  if (!galleryConfig?.page) return [];

  const params = new URLSearchParams({
    action: "parse",
    page: galleryConfig.page,
    prop: "wikitext",
    format: "json",
  });

  const data = await fetchJson(`${API}?${params}`, { headers: { "User-Agent": UA, Accept: "application/json" } });
  const wikitext = data.parse?.wikitext?.["*"] ?? "";
  return parseGalleryRecords(wikitext);
}

async function fetchCategoryRecords() {
  if (!categoryConfig?.title) return [];

  const records = [];
  const seen = new Set();
  let continuation = {};

  do {
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle: categoryConfig.title,
      cmnamespace: "6",
      cmlimit: "max",
      format: "json",
      ...continuation,
    });
    const data = await fetchJson(`${API}?${params}`, { headers: { "User-Agent": UA, Accept: "application/json" } });
    for (const member of data.query?.categorymembers ?? []) {
      const fileTitle = normalizeFileTitle(member.title);
      if (seen.has(fileTitle) || shouldSkipCategoryFile(fileTitle)) continue;
      seen.add(fileTitle);

      records.push({
        source: categoryConfig.sourceName ?? "commons-category",
        qid: null,
        title: titleFromCategoryFile(fileTitle),
        year: null,
        height_cm: null,
        width_cm: null,
        collection: null,
        catalog_number: null,
        sitelinks: 0,
        iiif: null,
        image_filename: fileTitle,
      });
    }
    continuation = data.continue ?? null;
  } while (continuation);

  return records;
}

if (!galleryConfig?.page && !categoryConfig?.title) {
  mkdirSync(process.env.DATA_DIR || "data", { recursive: true });
  writeFileSync(OUT, JSON.stringify({ count: 0, records: [] }, null, 2));
  console.log(`Commons gallery: skipped for ${config.artist.name} → ${OUT}`);
  process.exit(0);
}

const records = [
  ...(await fetchGalleryRecords()),
  ...(await fetchCategoryRecords()),
];

mkdirSync(process.env.DATA_DIR || "data", { recursive: true });
writeFileSync(OUT, JSON.stringify({ count: records.length, records }, null, 2));
console.log(`Commons gallery/category: ${records.length} image-backed entries → ${OUT}`);
