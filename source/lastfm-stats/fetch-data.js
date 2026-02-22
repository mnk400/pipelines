/**
 * Fetches and caches:
 *  1. Weekly chart list (all available weeks)
 *  2. Weekly artist charts for each week
 *  3. Top tags for every unique artist
 *
 * All data is cached to last.fm/data/ so subsequent runs skip already-fetched data.
 * Run: node last.fm/fetch-data.js
 */

import {
  getWeeklyChartList,
  getWeeklyArtistChart,
  getArtistTopTags,
} from "./api.js";
import { loadCache, saveCache } from "./cache.js";

// ── Step 1: Weekly chart list ──────────────────────────────────────
async function fetchChartList() {
  const cached = loadCache("weekly-chart-list");
  if (cached) {
    console.log(`  Chart list cached (${cached.length} weeks)`);
    return cached;
  }
  console.log("  Fetching weekly chart list…");
  const charts = await getWeeklyChartList();
  saveCache("weekly-chart-list", charts);
  console.log(`  Got ${charts.length} weeks`);
  return charts;
}

// ── Step 2: Weekly artist charts ───────────────────────────────────
async function fetchWeeklyArtistCharts(chartList) {
  let charts = loadCache("weekly-artist-charts") || {};
  const total = chartList.length;
  let fetched = 0;
  let skipped = 0;

  for (const week of chartList) {
    const key = `${week.from}-${week.to}`;
    if (charts[key]) {
      skipped++;
      continue;
    }
    fetched++;
    process.stdout.write(
      `\r  Fetching artist charts: ${fetched + skipped}/${total} (${fetched} new)`,
    );
    try {
      const artists = await getWeeklyArtistChart(week.from, week.to);
      charts[key] = artists.map((a) => ({
        name: a.name,
        playcount: parseInt(a.playcount, 10),
        mbid: a.mbid || null,
      }));
    } catch (e) {
      console.warn(`\n  Warning: failed week ${key}: ${e.message}`);
      charts[key] = [];
    }

    // Save periodically
    if (fetched % 25 === 0) saveCache("weekly-artist-charts", charts);
  }

  saveCache("weekly-artist-charts", charts);
  console.log(
    `\n  Artist charts done: ${skipped} cached, ${fetched} fetched`,
  );
  return charts;
}

// ── Step 3: Artist tags ────────────────────────────────────────────
async function fetchArtistTags(weeklyCharts) {
  // Collect all unique artist names
  const artistSet = new Set();
  for (const artists of Object.values(weeklyCharts)) {
    for (const a of artists) {
      artistSet.add(a.name);
    }
  }

  let tags = loadCache("artist-tags") || {};
  const allArtists = [...artistSet];
  const total = allArtists.length;
  let fetched = 0;
  let skipped = 0;

  console.log(`  ${total} unique artists to tag`);

  for (const artist of allArtists) {
    if (tags[artist] !== undefined) {
      skipped++;
      continue;
    }
    fetched++;
    process.stdout.write(
      `\r  Fetching tags: ${fetched + skipped}/${total} (${fetched} new)`,
    );
    try {
      tags[artist] = await getArtistTopTags(artist);
    } catch (e) {
      tags[artist] = [];
    }

    // Save periodically
    if (fetched % 50 === 0) saveCache("artist-tags", tags);
  }

  saveCache("artist-tags", tags);
  console.log(`\n  Tags done: ${skipped} cached, ${fetched} fetched`);
  return tags;
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log("Step 1/3: Chart list");
  const chartList = await fetchChartList();

  console.log("Step 2/3: Weekly artist charts");
  const weeklyCharts = await fetchWeeklyArtistCharts(chartList);

  console.log("Step 3/3: Artist tags");
  await fetchArtistTags(weeklyCharts);

  console.log("\nAll data fetched and cached in last.fm/data/");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
