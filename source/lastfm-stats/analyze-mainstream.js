/**
 * Analyzes mainstream vs obscure listening over time.
 * Uses Last.fm listener counts as a proxy for how "mainstream" an artist is.
 *
 * The "obscurity score" for a month is the weighted median listener count
 * of artists listened to that month (weighted by play count).
 * Lower = more obscure, higher = more mainstream.
 *
 * Run: node last.fm/analyze-mainstream.js
 */

import { loadCache, saveCache } from "./cache.js";

function weightedPercentile(items, percentile) {
  // items: [{ value, weight }] sorted by value
  const totalWeight = items.reduce((s, i) => s + i.weight, 0);
  const target = totalWeight * percentile;
  let cumulative = 0;
  for (const item of items) {
    cumulative += item.weight;
    if (cumulative >= target) return item.value;
  }
  return items[items.length - 1].value;
}

function analyze() {
  const chartList = loadCache("weekly-chart-list");
  const weeklyCharts = loadCache("weekly-artist-charts");
  const artistListeners = loadCache("artist-listeners");

  if (!chartList || !weeklyCharts || !artistListeners) {
    console.error("Missing data. Run fetch scripts first.");
    process.exit(1);
  }

  // Classify artists into tiers
  const allListenerCounts = Object.values(artistListeners).filter((v) => v > 0);
  allListenerCounts.sort((a, b) => a - b);
  const p25 = allListenerCounts[Math.floor(allListenerCounts.length * 0.25)];
  const p50 = allListenerCounts[Math.floor(allListenerCounts.length * 0.5)];
  const p75 = allListenerCounts[Math.floor(allListenerCounts.length * 0.75)];

  console.log("Listener count quartiles across your artists:");
  console.log(`  25th: ${p25.toLocaleString()}`);
  console.log(`  50th: ${p50.toLocaleString()}`);
  console.log(`  75th: ${p75.toLocaleString()}`);

  // Thresholds for mainstream tiers
  const TIERS = [
    { name: "obscure", max: 100000, color: "#7c3aed" },
    { name: "niche", max: 500000, color: "#6366f1" },
    { name: "mid", max: 2000000, color: "#3b82f6" },
    { name: "popular", max: 5000000, color: "#f59e0b" },
    { name: "mainstream", max: Infinity, color: "#ef4444" },
  ];

  function getTier(listeners) {
    return TIERS.find((t) => listeners <= t.max).name;
  }

  // Build monthly data
  const monthlyData = {};

  for (const week of chartList) {
    const key = `${week.from}-${week.to}`;
    const artists = weeklyCharts[key] || [];
    const weekStart = new Date(parseInt(week.from, 10) * 1000);
    const monthKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}`;

    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        artists: [],
        tierPlays: { obscure: 0, niche: 0, mid: 0, popular: 0, mainstream: 0 },
        totalPlays: 0,
      };
    }

    for (const artist of artists) {
      const listeners = artistListeners[artist.name] || 0;
      if (listeners === 0) continue;

      monthlyData[monthKey].artists.push({
        name: artist.name,
        playcount: artist.playcount,
        listeners,
      });

      const tier = getTier(listeners);
      monthlyData[monthKey].tierPlays[tier] += artist.playcount;
      monthlyData[monthKey].totalPlays += artist.playcount;
    }
  }

  // Compute monthly scores
  const months = Object.keys(monthlyData)
    .filter((m) => monthlyData[m].totalPlays > 0)
    .sort();

  const monthly = months.map((month) => {
    const d = monthlyData[month];

    // Weighted median listener count
    const sorted = d.artists
      .map((a) => ({ value: a.listeners, weight: a.playcount }))
      .sort((a, b) => a.value - b.value);

    const medianListeners = weightedPercentile(sorted, 0.5);
    const p25Listeners = weightedPercentile(sorted, 0.25);
    const p75Listeners = weightedPercentile(sorted, 0.75);

    // Obscurity score: 0 (most mainstream) to 100 (most obscure)
    // Using log scale since listener counts span orders of magnitude
    // log10(100k) = 5, log10(10M) = 7 — map this range to 100–0
    const logMedian = Math.log10(Math.max(medianListeners, 1));
    const obscurityScore = Math.max(0, Math.min(100, (7 - logMedian) * 50));

    // Tier percentages
    const tierPct = {};
    for (const tier of TIERS) {
      tierPct[tier.name] =
        d.totalPlays > 0
          ? Math.round((d.tierPlays[tier.name] / d.totalPlays) * 10000) / 100
          : 0;
    }

    // Most obscure artist this month (with at least 3 plays)
    const obscure = d.artists
      .filter((a) => a.playcount >= 3)
      .sort((a, b) => a.listeners - b.listeners)[0];

    // Most mainstream artist this month
    const mainstream = d.artists.sort((a, b) => b.listeners - a.listeners)[0];

    return {
      month,
      totalPlays: d.totalPlays,
      medianListeners,
      p25Listeners,
      p75Listeners,
      obscurityScore: Math.round(obscurityScore * 10) / 10,
      tierPct,
      mostObscure: obscure
        ? { name: obscure.name, listeners: obscure.listeners, plays: obscure.playcount }
        : null,
      mostMainstream: mainstream
        ? { name: mainstream.name, listeners: mainstream.listeners, plays: mainstream.playcount }
        : null,
    };
  });

  // Compute quarterly for smoother view
  const quarterly = [];
  for (let i = 0; i < monthly.length; i += 3) {
    const chunk = monthly.slice(i, i + 3);
    if (chunk.length === 0) continue;
    const q = {
      month: chunk[0].month,
      totalPlays: chunk.reduce((s, m) => s + m.totalPlays, 0),
      obscurityScore:
        Math.round(
          (chunk.reduce((s, m) => s + m.obscurityScore, 0) / chunk.length) * 10,
        ) / 10,
      medianListeners: Math.round(
        chunk.reduce((s, m) => s + m.medianListeners, 0) / chunk.length,
      ),
      tierPct: {},
    };
    for (const tier of TIERS) {
      q.tierPct[tier.name] =
        Math.round(
          (chunk.reduce((s, m) => s + m.tierPct[tier.name], 0) / chunk.length) *
            100,
        ) / 100;
    }
    quarterly.push(q);
  }

  const result = {
    tiers: TIERS,
    monthly,
    quarterly,
    meta: {
      totalArtists: Object.keys(artistListeners).length,
      firstMonth: months[0],
      lastMonth: months[months.length - 1],
      overallMedianListeners: Math.round(
        monthly.reduce((s, m) => s + m.medianListeners, 0) / monthly.length,
      ),
    },
  };

  saveCache("mainstream-analysis", result);

  // Print summary
  console.log(`\n═══ Mainstream vs Obscure ═══\n`);
  console.log(
    `Period: ${result.meta.firstMonth} to ${result.meta.lastMonth}`,
  );
  console.log(
    `Overall median artist listeners: ${result.meta.overallMedianListeners.toLocaleString()}\n`,
  );

  // Show trend
  const firstYear = monthly.slice(0, 12);
  const lastYear = monthly.slice(-12);
  const avgFirst =
    firstYear.reduce((s, m) => s + m.obscurityScore, 0) / firstYear.length;
  const avgLast =
    lastYear.reduce((s, m) => s + m.obscurityScore, 0) / lastYear.length;

  console.log("Obscurity score (0 = mainstream, 100 = obscure):");
  console.log(
    `  First year avg: ${avgFirst.toFixed(1)} → Last year avg: ${avgLast.toFixed(1)}`,
  );
  console.log(
    `  ${avgLast > avgFirst ? "You've gotten more obscure!" : "You've gotten more mainstream!"}`,
  );

  // Highlights
  const mostObscureMonth = monthly.reduce((best, m) =>
    m.obscurityScore > best.obscurityScore ? m : best,
  );
  const mostMainstreamMonth = monthly.reduce((best, m) =>
    m.obscurityScore < best.obscurityScore ? m : best,
  );

  console.log(
    `\n  Most obscure month: ${mostObscureMonth.month} (score: ${mostObscureMonth.obscurityScore})`,
  );
  console.log(
    `  Most mainstream month: ${mostMainstreamMonth.month} (score: ${mostMainstreamMonth.obscurityScore})`,
  );

  console.log(`\nSaved to last.fm/data/mainstream-analysis.json`);
}

analyze();
