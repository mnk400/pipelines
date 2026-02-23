/**
 * Analyzes discovery rate — how many new artists per month/quarter over time.
 *
 * Run: node analyze-discovery.js
 */

import { loadCache, saveCache } from "./cache.js";

function getMonth(uts) {
  const d = new Date(uts * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getQuarter(month) {
  const [y, m] = month.split("-");
  const q = Math.floor((parseInt(m) - 1) / 3) + 1;
  return `${y}-Q${q}`;
}

function analyze() {
  const scrobbles = loadCache("scrobbles");
  if (!scrobbles) {
    console.error("No scrobbles cached. Run fetch-scrobbles.js first.");
    process.exit(1);
  }

  console.log(`Analyzing ${scrobbles.length} scrobbles for discovery rate…\n`);

  // Sort scrobbles chronologically
  const sorted = [...scrobbles].sort((a, b) => a.uts - b.uts);

  // Walk through and track new vs seen artists per month
  const seenEver = new Set();
  const monthData = {}; // { month: { newArtists: Set, totalArtists: Set, totalPlays: number } }

  for (const s of sorted) {
    const month = getMonth(s.uts);
    if (!monthData[month]) {
      monthData[month] = { newArtists: new Set(), totalArtists: new Set(), totalPlays: 0 };
    }
    const md = monthData[month];
    md.totalPlays++;
    md.totalArtists.add(s.artist);

    if (!seenEver.has(s.artist)) {
      seenEver.add(s.artist);
      md.newArtists.add(s.artist);
    }
  }

  // Build monthly array
  const months = Object.keys(monthData).sort();
  let cumulative = 0;
  const monthly = months.map((month) => {
    const md = monthData[month];
    const newCount = md.newArtists.size;
    const totalCount = md.totalArtists.size;
    cumulative += newCount;
    return {
      month,
      newArtists: newCount,
      totalArtists: totalCount,
      totalPlays: md.totalPlays,
      newPct: totalCount > 0 ? Math.round((newCount / totalCount) * 1000) / 10 : 0,
      cumulativeArtists: cumulative,
    };
  });

  // Build quarterly rollup
  const quarterMap = {};
  const quarterNewSets = {};
  const quarterTotalSets = {};

  for (const month of months) {
    const q = getQuarter(month);
    const md = monthData[month];
    if (!quarterMap[q]) {
      quarterMap[q] = { totalPlays: 0 };
      quarterNewSets[q] = new Set();
      quarterTotalSets[q] = new Set();
    }
    quarterMap[q].totalPlays += md.totalPlays;
    for (const a of md.newArtists) quarterNewSets[q].add(a);
    for (const a of md.totalArtists) quarterTotalSets[q].add(a);
  }

  let qCumulative = 0;
  // Rebuild cumulative from quarterly new counts
  const quarters = Object.keys(quarterMap).sort();
  const quarterly = quarters.map((q) => {
    const newCount = quarterNewSets[q].size;
    const totalCount = quarterTotalSets[q].size;
    qCumulative += newCount;
    return {
      quarter: q,
      newArtists: newCount,
      totalArtists: totalCount,
      totalPlays: quarterMap[q].totalPlays,
      newPct: totalCount > 0 ? Math.round((newCount / totalCount) * 1000) / 10 : 0,
      cumulativeArtists: qCumulative,
    };
  });

  const result = {
    monthly,
    quarterly,
    meta: {
      totalUniqueArtists: seenEver.size,
      firstMonth: months[0],
      lastMonth: months[months.length - 1],
    },
  };

  saveCache("discovery", result);

  // Print summary
  console.log("═══ Discovery Rate ═══\n");
  console.log(`${seenEver.size} unique artists discovered from ${months[0]} to ${months[months.length - 1]}\n`);

  console.log("Quarterly new artists (last 8 quarters):");
  for (const q of quarterly.slice(-8)) {
    const bar = "█".repeat(Math.round(q.newArtists / 5));
    console.log(`  ${q.quarter}: ${String(q.newArtists).padStart(4)} new (${q.newPct}% of active) ${bar}`);
  }

  console.log(`\nCumulative: ${quarterly[quarterly.length - 1].cumulativeArtists} artists`);
  console.log("\nSaved to data/discovery.json");
}

analyze();
