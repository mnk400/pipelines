/**
 * Fetches listener counts for all unique artists.
 * Run: node last.fm/fetch-artist-listeners.js
 */

import { getArtistInfo } from "./api.js";
import { loadCache, saveCache } from "./cache.js";

async function main() {
  const weeklyCharts = loadCache("weekly-artist-charts");
  if (!weeklyCharts) {
    console.error("No weekly charts cached. Run fetch-data.js first.");
    process.exit(1);
  }

  const artistSet = new Set();
  for (const artists of Object.values(weeklyCharts)) {
    for (const a of artists) artistSet.add(a.name);
  }

  let listeners = loadCache("artist-listeners") || {};
  const allArtists = [...artistSet];
  const total = allArtists.length;
  let fetched = 0;
  let skipped = 0;

  console.log(`${total} unique artists to fetch listener counts for`);

  for (const artist of allArtists) {
    if (listeners[artist] !== undefined) {
      skipped++;
      continue;
    }
    fetched++;
    process.stdout.write(
      `\r  Fetching: ${fetched + skipped}/${total} (${fetched} new)`,
    );
    try {
      const info = await getArtistInfo(artist);
      listeners[artist] = info ? info.listeners : 0;
    } catch {
      listeners[artist] = 0;
    }

    if (fetched % 50 === 0) saveCache("artist-listeners", listeners);
  }

  saveCache("artist-listeners", listeners);
  console.log(`\n\nDone: ${skipped} cached, ${fetched} fetched`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
