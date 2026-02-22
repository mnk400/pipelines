/**
 * Fetches all scrobbles with timestamps.
 * Caches pages to disk so re-runs skip already-fetched pages.
 *
 * Run: node last.fm/fetch-scrobbles.js
 */

import { getRecentTracks } from "./api.js";
import { loadCache, saveCache } from "./cache.js";

async function main() {
  let allScrobbles = loadCache("scrobbles") || [];
  const seenKeys = new Set(allScrobbles.map((s) => `${s.uts}-${s.track}-${s.artist}`));

  // First call to get total pages
  console.log("Fetching page 1 to get total count…");
  const first = await getRecentTracks(1, 200);
  const totalPages = parseInt(first["@attr"].totalPages, 10);
  const totalTracks = parseInt(first["@attr"].total, 10);
  console.log(`Total scrobbles: ${totalTracks} across ${totalPages} pages`);

  if (allScrobbles.length >= totalTracks - 200) {
    console.log(`Already have ${allScrobbles.length} scrobbles cached, fetching only new ones`);
  }

  function extractTracks(tracks) {
    const results = [];
    for (const t of tracks) {
      // Skip "now playing" entries (no date)
      if (t["@attr"]?.nowplaying === "true") continue;
      if (!t.date?.uts) continue;

      const key = `${t.date.uts}-${t.name}-${t.artist["#text"]}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      results.push({
        track: t.name,
        artist: t.artist["#text"],
        album: t.album["#text"] || null,
        uts: parseInt(t.date.uts, 10),
      });
    }
    return results;
  }

  // Process first page
  allScrobbles.push(...extractTracks(first.track));

  let newCount = 0;
  let emptyPages = 0;
  for (let page = 2; page <= totalPages; page++) {
    process.stdout.write(
      `\r  Fetching page ${page}/${totalPages} (${allScrobbles.length} scrobbles, ${newCount} new)`,
    );
    try {
      const data = await getRecentTracks(page, 200);
      const newTracks = extractTracks(data.track);
      allScrobbles.push(...newTracks);
      newCount += newTracks.length;

      // Recent tracks are newest-first. If we get 3 consecutive pages
      // with nothing new, the rest are already cached — stop early.
      if (newTracks.length === 0) {
        emptyPages++;
        if (emptyPages >= 3) {
          console.log(`\n  Stopping early: ${emptyPages} consecutive pages with no new tracks`);
          break;
        }
      } else {
        emptyPages = 0;
      }
    } catch (e) {
      console.warn(`\n  Warning: page ${page} failed: ${e.message}`);
    }

    // Save every 50 pages
    if (page % 50 === 0) {
      saveCache("scrobbles", allScrobbles);
    }
  }

  // Sort by timestamp
  allScrobbles.sort((a, b) => a.uts - b.uts);
  saveCache("scrobbles", allScrobbles);
  console.log(`\n\nDone: ${allScrobbles.length} total scrobbles saved`);
  console.log(
    `Date range: ${new Date(allScrobbles[0].uts * 1000).toISOString().split("T")[0]} to ${new Date(allScrobbles[allScrobbles.length - 1].uts * 1000).toISOString().split("T")[0]}`,
  );
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
