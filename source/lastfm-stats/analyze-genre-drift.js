/**
 * Analyzes genre drift over time from cached Last.fm data.
 * Produces a monthly genre breakdown weighted by play counts.
 *
 * Run: node last.fm/analyze-genre-drift.js
 */

import { loadCache, saveCache } from "./cache.js";

// ── Genre normalization ────────────────────────────────────────────
// Last.fm tags are messy — normalize into broader genre buckets
const GENRE_MAP = {
  // Rock family
  rock: "rock",
  "classic rock": "rock",
  "hard rock": "rock",
  "garage rock": "rock",
  "blues rock": "rock",
  "stoner rock": "rock",
  "psychedelic rock": "psychedelic",
  "space rock": "psychedelic",
  "progressive rock": "prog",
  "prog rock": "prog",
  progressive: "prog",
  "art rock": "prog",

  // Metal family
  metal: "metal",
  "heavy metal": "metal",
  "thrash metal": "metal",
  "death metal": "metal",
  "black metal": "metal",
  "doom metal": "metal",
  "progressive metal": "metal",
  metalcore: "metal",
  "nu metal": "metal",
  "sludge metal": "metal",
  "post-metal": "metal",
  grindcore: "metal",
  deathcore: "metal",

  // Punk family
  punk: "punk",
  "punk rock": "punk",
  "pop punk": "punk",
  "post-punk": "post-punk",
  hardcore: "punk",
  "hardcore punk": "punk",
  emo: "emo",
  screamo: "emo",
  "midwest emo": "emo",
  skramz: "emo",
  "math rock": "math rock",

  // Alternative / Indie
  alternative: "alternative",
  "alternative rock": "alternative",
  indie: "indie",
  "indie rock": "indie",
  "indie pop": "indie",
  "indie folk": "folk",
  shoegaze: "shoegaze",
  dreampop: "shoegaze",
  "dream pop": "shoegaze",
  grunge: "grunge",
  britpop: "britpop",
  "noise rock": "noise",
  "noise pop": "noise",
  noise: "noise",
  "post-rock": "post-rock",

  // Electronic family
  electronic: "electronic",
  electronica: "electronic",
  edm: "electronic",
  techno: "electronic",
  house: "electronic",
  trance: "electronic",
  "drum and bass": "electronic",
  dnb: "electronic",
  dubstep: "electronic",
  idm: "electronic",
  ambient: "ambient",
  synthwave: "synthwave",
  synthpop: "synthwave",
  "new wave": "new wave",
  vaporwave: "electronic",
  glitch: "electronic",

  // Hip-hop family
  "hip-hop": "hip-hop",
  "hip hop": "hip-hop",
  rap: "hip-hop",
  "underground hip-hop": "hip-hop",
  "east coast hip hop": "hip-hop",
  "west coast hip hop": "hip-hop",
  trap: "hip-hop",
  boom: "hip-hop",
  "boom bap": "hip-hop",

  // R&B / Soul / Funk
  rnb: "r&b/soul",
  "r&b": "r&b/soul",
  soul: "r&b/soul",
  "neo-soul": "r&b/soul",
  funk: "funk",

  // Pop
  pop: "pop",
  "synth pop": "synthwave",
  "power pop": "pop",
  "dance pop": "pop",
  "art pop": "pop",
  "k-pop": "pop",
  "j-pop": "pop",

  // Jazz
  jazz: "jazz",
  "jazz fusion": "jazz",
  "nu jazz": "jazz",

  // Blues
  blues: "blues",

  // Folk / Country / Acoustic
  folk: "folk",
  "folk rock": "folk",
  country: "country",
  americana: "country",
  "singer-songwriter": "singer-songwriter",
  acoustic: "singer-songwriter",

  // Classical / Orchestral
  classical: "classical",
  orchestral: "classical",
  neoclassical: "classical",

  // World / Misc
  reggae: "reggae",
  ska: "ska",
  latin: "latin",
  world: "world",
  experimental: "experimental",
  "avant-garde": "experimental",

  // Bollywood / Indian
  bollywood: "bollywood",
  indian: "bollywood",
  "indian classical": "bollywood",
  hindi: "bollywood",
  filmi: "bollywood",
  "indian pop": "bollywood",
  desi: "bollywood",

  // Lo-fi
  "lo-fi": "lo-fi",
  lofi: "lo-fi",
};

function normalizeGenre(tag) {
  const lower = tag.toLowerCase().trim();
  return GENRE_MAP[lower] || null;
}

// ── Analysis ───────────────────────────────────────────────────────
function analyze() {
  const chartList = loadCache("weekly-chart-list");
  const weeklyCharts = loadCache("weekly-artist-charts");
  const artistTags = loadCache("artist-tags");

  if (!chartList || !weeklyCharts || !artistTags) {
    console.error("Missing cached data. Run fetch-data.js first.");
    process.exit(1);
  }

  // Build monthly genre weights
  // For each week, for each artist, distribute their playcount across their genres
  const monthlyGenres = {}; // { "2018-01": { rock: 150, hip-hop: 80, ... } }
  const monthlyTotalPlays = {}; // { "2018-01": 500 }

  for (const week of chartList) {
    const key = `${week.from}-${week.to}`;
    const artists = weeklyCharts[key] || [];
    const weekStart = new Date(parseInt(week.from, 10) * 1000);
    const monthKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}`;

    if (!monthlyGenres[monthKey]) {
      monthlyGenres[monthKey] = {};
      monthlyTotalPlays[monthKey] = 0;
    }

    for (const artist of artists) {
      const tags = artistTags[artist.name] || [];
      const genres = [];

      for (const tag of tags) {
        const genre = normalizeGenre(tag.name);
        if (genre) genres.push({ genre, weight: tag.count });
      }

      if (genres.length === 0) continue;

      // Normalize tag weights so they sum to 1 for this artist
      const totalWeight = genres.reduce((s, g) => s + g.weight, 0);

      for (const { genre, weight } of genres) {
        const fraction = weight / totalWeight;
        const contribution = artist.playcount * fraction;
        monthlyGenres[monthKey][genre] =
          (monthlyGenres[monthKey][genre] || 0) + contribution;
      }

      monthlyTotalPlays[monthKey] += artist.playcount;
    }
  }

  // Convert to percentages and find top genres across all time
  const allGenres = new Set();
  const months = Object.keys(monthlyGenres).sort();

  for (const month of months) {
    const total = Object.values(monthlyGenres[month]).reduce(
      (s, v) => s + v,
      0,
    );
    for (const genre of Object.keys(monthlyGenres[month])) {
      monthlyGenres[month][genre] = (monthlyGenres[month][genre] / total) * 100;
      allGenres.add(genre);
    }
  }

  // Find top N genres by average share across all months
  const genreAvg = {};
  for (const genre of allGenres) {
    let sum = 0;
    let count = 0;
    for (const month of months) {
      if (monthlyGenres[month][genre]) {
        sum += monthlyGenres[month][genre];
        count++;
      }
    }
    genreAvg[genre] = sum / months.length; // avg across ALL months (including zeros)
  }

  const topGenres = Object.entries(genreAvg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([genre]) => genre);

  // Build final dataset: monthly time series for top genres
  const dataset = months.map((month) => {
    const entry = { month, totalPlays: monthlyTotalPlays[month] || 0 };
    for (const genre of topGenres) {
      entry[genre] = Math.round((monthlyGenres[month][genre] || 0) * 100) / 100;
    }
    return entry;
  });

  // Also compute quarterly for smoother visualization
  const quarterlyDataset = [];
  for (let i = 0; i < months.length; i += 3) {
    const chunk = dataset.slice(i, i + 3);
    if (chunk.length === 0) continue;
    const qEntry = { month: chunk[0].month, totalPlays: 0 };
    for (const genre of topGenres) qEntry[genre] = 0;
    for (const entry of chunk) {
      qEntry.totalPlays += entry.totalPlays;
      for (const genre of topGenres) qEntry[genre] += entry[genre];
    }
    for (const genre of topGenres) {
      qEntry[genre] = Math.round((qEntry[genre] / chunk.length) * 100) / 100;
    }
    quarterlyDataset.push(qEntry);
  }

  const result = {
    topGenres,
    genreAverages: Object.fromEntries(
      topGenres.map((g) => [g, Math.round(genreAvg[g] * 100) / 100]),
    ),
    monthly: dataset,
    quarterly: quarterlyDataset,
    meta: {
      totalMonths: months.length,
      firstMonth: months[0],
      lastMonth: months[months.length - 1],
      totalArtists: Object.keys(artistTags).length,
    },
  };

  saveCache("genre-drift", result);

  // Print summary
  console.log(`\nGenre Drift Analysis`);
  console.log(`${"─".repeat(50)}`);
  console.log(
    `Period: ${result.meta.firstMonth} to ${result.meta.lastMonth} (${result.meta.totalMonths} months)`,
  );
  console.log(`Artists analyzed: ${result.meta.totalArtists}`);
  console.log(`\nTop 15 genres by average share:`);
  for (const genre of topGenres) {
    const bar = "█".repeat(Math.round(genreAvg[genre]));
    console.log(`  ${genre.padEnd(20)} ${genreAvg[genre].toFixed(1)}% ${bar}`);
  }

  // Show drift highlights
  console.log(`\nNotable shifts:`);
  for (const genre of topGenres.slice(0, 8)) {
    const firstHalf = dataset
      .slice(0, Math.floor(dataset.length / 2))
      .reduce((s, d) => s + (d[genre] || 0), 0);
    const secondHalf = dataset
      .slice(Math.floor(dataset.length / 2))
      .reduce((s, d) => s + (d[genre] || 0), 0);
    const halfLen = Math.floor(dataset.length / 2);
    const avgFirst = firstHalf / halfLen;
    const avgSecond = secondHalf / (dataset.length - halfLen);
    const diff = avgSecond - avgFirst;
    const arrow = diff > 0 ? "↑" : "↓";
    if (Math.abs(diff) > 1) {
      console.log(
        `  ${genre}: ${avgFirst.toFixed(1)}% → ${avgSecond.toFixed(1)}% (${arrow}${Math.abs(diff).toFixed(1)}%)`,
      );
    }
  }

  console.log(`\nSaved to last.fm/data/genre-drift.json`);
}

analyze();
