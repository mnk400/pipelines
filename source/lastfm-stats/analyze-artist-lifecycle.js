/**
 * Analyzes artist lifecycles — which artists had a clear peak and faded,
 * and which have been constants throughout.
 *
 * Run: node analyze-artist-lifecycle.js
 */

import { loadCache, saveCache } from "./cache.js";

function getQuarter(uts) {
  const d = new Date(uts * 1000);
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

function analyze() {
  const scrobbles = loadCache("scrobbles");
  if (!scrobbles) {
    console.error("No scrobbles cached. Run fetch-scrobbles.js first.");
    process.exit(1);
  }

  console.log(`Analyzing ${scrobbles.length} scrobbles for artist lifecycles…\n`);

  // Group scrobbles by artist + quarter
  const artistQuarters = {}; // { artist: { quarter: count } }
  const artistTotal = {};    // { artist: totalPlays }

  for (const s of scrobbles) {
    const q = getQuarter(s.uts);
    if (!artistQuarters[s.artist]) artistQuarters[s.artist] = {};
    artistQuarters[s.artist][q] = (artistQuarters[s.artist][q] || 0) + 1;
    artistTotal[s.artist] = (artistTotal[s.artist] || 0) + 1;
  }

  // Build sorted list of all quarters
  const allQuarters = new Set();
  for (const quarters of Object.values(artistQuarters)) {
    for (const q of Object.keys(quarters)) allQuarters.add(q);
  }
  const sortedQuarters = [...allQuarters].sort();
  const lastFourQuarters = new Set(sortedQuarters.slice(-4));

  // Classify artists with >= 50 total plays
  const phases = [];
  const constants = [];
  const totalArtists = Object.keys(artistTotal).length;
  let qualifyingArtists = 0;

  for (const [artist, total] of Object.entries(artistTotal)) {
    if (total < 50) continue;
    qualifyingArtists++;

    const quarters = artistQuarters[artist];
    const timeline = sortedQuarters.map((q) => ({
      quarter: q,
      plays: quarters[q] || 0,
    }));

    // Find peak
    let peakQuarter = sortedQuarters[0];
    let peakPlays = 0;
    for (const { quarter, plays } of timeline) {
      if (plays > peakPlays) {
        peakPlays = plays;
        peakQuarter = quarter;
      }
    }

    // Active quarters (quarters with any plays)
    const activeQuarters = timeline.filter((t) => t.plays > 0);
    const activeCount = activeQuarters.length;
    const firstQuarter = activeQuarters[0]?.quarter;
    const lastActiveQuarter = activeQuarters[activeQuarters.length - 1]?.quarter;

    // Last 4 quarters total
    const lastFourTotal = timeline
      .filter((t) => lastFourQuarters.has(t.quarter))
      .reduce((s, t) => s + t.plays, 0);

    // Check if peak is recent
    const peakIsRecent = lastFourQuarters.has(peakQuarter);

    // Phase artist: peak quarter >30% of total, last 4 quarters <10% of peak
    const peakShare = peakPlays / total;
    const recentVsPeak = peakPlays > 0 ? lastFourTotal / peakPlays : 0;

    // Constant artist: present in >60% of quarters, no single quarter >20% of total
    const presencePct = activeCount / sortedQuarters.length;
    const maxShare = peakPlays / total;

    if (!peakIsRecent && peakShare > 0.3 && recentVsPeak < 0.1) {
      phases.push({
        artist,
        totalPlays: total,
        peakQuarter,
        peakPlays,
        firstQuarter,
        lastActiveQuarter,
        timeline,
      });
    } else if (presencePct > 0.6 && maxShare < 0.2) {
      constants.push({
        artist,
        totalPlays: total,
        peakQuarter,
        peakPlays,
        firstQuarter,
        lastActiveQuarter,
        timeline,
      });
    }
  }

  // Sort phases by total plays (most interesting first), take top 15
  phases.sort((a, b) => b.totalPlays - a.totalPlays);
  const topPhases = phases.slice(0, 15);

  // Sort constants by total plays, take top 10
  constants.sort((a, b) => b.totalPlays - a.totalPlays);
  const topConstants = constants.slice(0, 10);

  const result = {
    phases: topPhases,
    constants: topConstants,
    meta: {
      totalArtists,
      qualifyingArtists,
      phaseCount: topPhases.length,
      constantCount: topConstants.length,
    },
  };

  saveCache("artist-lifecycle", result);

  // Print summary
  console.log("═══ Artist Lifecycles ═══\n");
  console.log(`${totalArtists} total artists, ${qualifyingArtists} with 50+ plays\n`);

  console.log(`Phase artists (${phases.length} found, showing top ${topPhases.length}):`);
  for (const a of topPhases) {
    console.log(
      `  ${a.artist.padEnd(30)} ${a.totalPlays} plays | peak ${a.peakQuarter} (${a.peakPlays})`
    );
  }

  console.log(`\nConstant artists (${constants.length} found, showing top ${topConstants.length}):`);
  for (const a of topConstants) {
    console.log(
      `  ${a.artist.padEnd(30)} ${a.totalPlays} plays | present in ${a.timeline.filter((t) => t.plays > 0).length}/${sortedQuarters.length} quarters`
    );
  }

  console.log("\nSaved to data/artist-lifecycle.json");
}

analyze();
