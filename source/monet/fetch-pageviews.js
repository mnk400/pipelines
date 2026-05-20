import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fetchJson } from "./http.js";

const UA = "manik.cc-monet-pipeline/0.1 (https://manik.cc; mnk_400@yahoo.com)";
const WD_API = "https://www.wikidata.org/w/api.php";
const PV_API = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article";
const BATCH_SIZE = 50;
const THROTTLE_MS = 50;

// Trailing 12 months, snapped to month boundaries (start of month, exclusive end).
const now = new Date();
const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), 1));
const fmtDay = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}01`;
const START = fmtDay(start);
const END = fmtDay(end);
const RANGE_KEY = `${START}-${END}`;

// We want Wikipedia language editions only — not Commons, Wikidata, sister projects.
const SITE_RE = /^[a-z][a-z0-9_-]*wiki$/;
const NON_WIKIPEDIA = new Set([
  "commonswiki", "wikidatawiki", "metawiki", "specieswiki",
  "mediawikiwiki", "wikimaniawiki", "sourceswiki", "incubatorwiki",
  "foundationwiki", "outreachwiki",
]);

function siteToProject(site) {
  return `${site.replace(/wiki$/, "").replace(/_/g, "-")}.wikipedia.org`;
}

async function fetchSitelinks(qids) {
  const out = new Map();
  for (let i = 0; i < qids.length; i += BATCH_SIZE) {
    const batch = qids.slice(i, i + BATCH_SIZE);
    const params = new URLSearchParams({
      action: "wbgetentities",
      ids: batch.join("|"),
      props: "sitelinks",
      format: "json",
    });
    const data = await fetchJson(`${WD_API}?${params}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    for (const [qid, ent] of Object.entries(data.entities || {})) {
      const links = [];
      for (const [site, info] of Object.entries(ent.sitelinks || {})) {
        if (!SITE_RE.test(site) || NON_WIKIPEDIA.has(site)) continue;
        links.push({ site, project: siteToProject(site), title: info.title });
      }
      out.set(qid, links);
    }
    process.stdout.write(`\rSitelinks: ${out.size}/${qids.length}`);
  }
  process.stdout.write("\n");
  return out;
}

const cachePath = "data/pageviews-cache.json";
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchViews(project, title) {
  const key = `${project}|${title}|${RANGE_KEY}`;
  if (cache[key] != null) return cache[key];
  const encoded = encodeURIComponent(title.replace(/ /g, "_"));
  const url = `${PV_API}/${project}/all-access/all-agents/${encoded}/monthly/${START}/${END}`;
  try {
    const data = await fetchJson(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    const sum = (data.items || []).reduce((acc, it) => acc + (it.views || 0), 0);
    cache[key] = sum;
    return sum;
  } catch (err) {
    // 404 = article exists in sitelinks but pageviews API has no data for it.
    // Treat as zero rather than aborting the whole pipeline.
    if (/^404\b/.test(err.message)) {
      cache[key] = 0;
      return 0;
    }
    throw err;
  }
}

const wd = JSON.parse(readFileSync("data/wikidata.json", "utf8"));
const qids = wd.records.map((r) => r.qid).filter(Boolean);

console.log(`Resolving sitelinks for ${qids.length} QIDs (range ${RANGE_KEY})...`);
const sitelinksByQid = await fetchSitelinks(qids);

const results = {};
let done = 0;
let cacheHits = 0;
let apiCalls = 0;
for (const [qid, links] of sitelinksByQid) {
  let total = 0;
  const byProject = {};
  for (const link of links) {
    const cacheKey = `${link.project}|${link.title}|${RANGE_KEY}`;
    const hit = cache[cacheKey] != null;
    const views = await fetchViews(link.project, link.title);
    byProject[link.site] = views;
    total += views;
    if (hit) cacheHits++;
    else {
      apiCalls++;
      await sleep(THROTTLE_MS);
    }
  }
  results[qid] = { total_365d: total, by_project: byProject };
  done++;
  if (done % 20 === 0 || done === sitelinksByQid.size) {
    process.stdout.write(`\rPageviews: ${done}/${sitelinksByQid.size}  (api=${apiCalls} cached=${cacheHits})`);
    writeFileSync(cachePath, JSON.stringify(cache));
  }
}
process.stdout.write("\n");

mkdirSync("data", { recursive: true });
writeFileSync(
  "data/pageviews.json",
  JSON.stringify({ range: RANGE_KEY, count: Object.keys(results).length, records: results }, null, 2),
);
writeFileSync(cachePath, JSON.stringify(cache));
console.log(`Pageviews: ${Object.keys(results).length} records → data/pageviews.json`);
