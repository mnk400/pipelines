/**
 * Analyzes "3 AM artists" — what you listen to at different hours of the day.
 * Uses timezone history to convert UTC timestamps to local time.
 *
 * Run: node last.fm/analyze-3am.js
 */

import { loadCache, saveCache } from "./cache.js";

// ── Timezone history ───────────────────────────────────────────────
// IST until Aug 28 2019, EST until Jun 28 2022, PST since then
const TZ_PERIODS = [
  { until: new Date("2019-08-28T00:00:00Z").getTime() / 1000, offsetMinutes: 330 },   // IST +5:30
  { until: new Date("2022-06-28T00:00:00Z").getTime() / 1000, offsetMinutes: -300 },  // EST -5:00
  { until: Infinity, offsetMinutes: -480 },                                             // PST -8:00
];

function getLocalHour(uts) {
  const period = TZ_PERIODS.find((p) => uts < p.until);
  const offsetMs = period.offsetMinutes * 60 * 1000;
  const localDate = new Date(uts * 1000 + offsetMs);
  return localDate.getUTCHours();
}

function getLocalDate(uts) {
  const period = TZ_PERIODS.find((p) => uts < p.until);
  const offsetMs = period.offsetMinutes * 60 * 1000;
  return new Date(uts * 1000 + offsetMs);
}

// ── Hour buckets ───────────────────────────────────────────────────
const TIME_BLOCKS = {
  "Late Night":    [0, 1, 2, 3, 4, 5],     // midnight–5am
  "Early Morning": [6, 7, 8, 9],            // 6am–9am
  "Daytime":       [10, 11, 12, 13, 14, 15, 16], // 10am–4pm
  "Evening":       [17, 18, 19, 20],        // 5pm–8pm
  "Night":         [21, 22, 23],            // 9pm–11pm
};

function getTimeBlock(hour) {
  for (const [block, hours] of Object.entries(TIME_BLOCKS)) {
    if (hours.includes(hour)) return block;
  }
  return "Unknown";
}

// ── Analysis ───────────────────────────────────────────────────────
function analyze() {
  const scrobbles = loadCache("scrobbles");
  if (!scrobbles) {
    console.error("No scrobbles cached. Run fetch-scrobbles.js first.");
    process.exit(1);
  }

  console.log(`Analyzing ${scrobbles.length} scrobbles…\n`);

  // Per-hour artist counts
  const hourlyArtists = {};   // { hour: { artist: count } }
  const hourlyTracks = {};    // { hour: { "artist - track": count } }
  const hourlyCounts = {};    // { hour: totalScrobbles }

  // Per time-block
  const blockArtists = {};

  // Overall artist counts for comparison
  const overallArtists = {};

  for (let h = 0; h < 24; h++) {
    hourlyArtists[h] = {};
    hourlyTracks[h] = {};
    hourlyCounts[h] = 0;
  }

  for (const block of Object.keys(TIME_BLOCKS)) {
    blockArtists[block] = {};
  }

  for (const s of scrobbles) {
    const hour = getLocalHour(s.uts);
    const block = getTimeBlock(hour);

    hourlyArtists[hour][s.artist] = (hourlyArtists[hour][s.artist] || 0) + 1;
    const trackKey = `${s.artist} — ${s.track}`;
    hourlyTracks[hour][trackKey] = (hourlyTracks[hour][trackKey] || 0) + 1;
    hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1;

    blockArtists[block][s.artist] = (blockArtists[block][s.artist] || 0) + 1;
    overallArtists[s.artist] = (overallArtists[s.artist] || 0) + 1;
  }

  // ── Find "3 AM artists" — artists disproportionately listened to late at night
  // Score = (% of late-night plays) / (% of overall plays)
  // High score = they're way more present at night than their overall popularity suggests
  const totalScrobbles = scrobbles.length;
  const lateNightHours = TIME_BLOCKS["Late Night"];
  const lateNightTotal = lateNightHours.reduce((s, h) => s + hourlyCounts[h], 0);

  const artistNightScore = {};
  for (const [artist, nightCount] of Object.entries(blockArtists["Late Night"])) {
    const overallCount = overallArtists[artist] || 1;
    const nightShare = nightCount / lateNightTotal;
    const overallShare = overallCount / totalScrobbles;
    artistNightScore[artist] = {
      score: nightShare / overallShare,
      nightCount,
      overallCount,
      nightPct: (nightShare * 100).toFixed(2),
      overallPct: (overallShare * 100).toFixed(2),
    };
  }

  // Top artists per time block (by raw count)
  const topByBlock = {};
  for (const [block, artists] of Object.entries(blockArtists)) {
    topByBlock[block] = Object.entries(artists)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([artist, count]) => ({ artist, count }));
  }

  // Top "disproportionately late-night" artists (minimum 10 late-night plays)
  const nightOwlArtists = Object.entries(artistNightScore)
    .filter(([_, d]) => d.nightCount >= 10)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 20)
    .map(([artist, d]) => ({ artist, ...d }));

  // Hourly distribution (for the clock visualization)
  const hourlyDistribution = [];
  for (let h = 0; h < 24; h++) {
    const topArtists = Object.entries(hourlyArtists[h])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([artist, count]) => ({ artist, count }));
    const topTracks = Object.entries(hourlyTracks[h])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([track, count]) => ({ track, count }));
    hourlyDistribution.push({
      hour: h,
      label: `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h < 12 ? "AM" : "PM"}`,
      totalPlays: hourlyCounts[h],
      topArtists,
      topTracks,
    });
  }

  // Day-of-week patterns for late-night listening
  const dayOfWeekLateNight = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (const s of scrobbles) {
    const hour = getLocalHour(s.uts);
    if (lateNightHours.includes(hour)) {
      const localDate = getLocalDate(s.uts);
      const day = dayNames[localDate.getUTCDay()];
      dayOfWeekLateNight[day]++;
    }
  }

  const result = {
    nightOwlArtists,
    topByBlock,
    hourlyDistribution,
    dayOfWeekLateNight,
    meta: {
      totalScrobbles: scrobbles.length,
      lateNightScrobbles: lateNightTotal,
      lateNightPct: ((lateNightTotal / totalScrobbles) * 100).toFixed(1),
    },
  };

  saveCache("3am-analysis", result);

  // Print summary
  console.log("═══ Your 3 AM Artists ═══\n");
  console.log(
    `${result.meta.lateNightScrobbles} of ${result.meta.totalScrobbles} scrobbles (${result.meta.lateNightPct}%) happened between midnight and 5 AM\n`,
  );

  console.log("Most disproportionately late-night artists:");
  console.log("(Artists you listen to way more at night than during the day)\n");
  for (const a of nightOwlArtists.slice(0, 10)) {
    console.log(
      `  ${a.artist.padEnd(30)} ${a.score.toFixed(1)}x night bias | ${a.nightCount} late-night plays / ${a.overallCount} total`,
    );
  }

  console.log("\n── Listening by time block ──\n");
  for (const [block, artists] of Object.entries(topByBlock)) {
    const hours = TIME_BLOCKS[block];
    const blockTotal = hours.reduce((s, h) => s + hourlyCounts[h], 0);
    console.log(`${block} (${blockTotal} plays):`);
    artists.slice(0, 5).forEach((a) => console.log(`  ${a.artist} (${a.count})`));
    console.log();
  }

  console.log("── Late-night by day of week ──\n");
  for (const [day, count] of Object.entries(dayOfWeekLateNight)) {
    const bar = "█".repeat(Math.round(count / 20));
    console.log(`  ${day}: ${String(count).padStart(5)} ${bar}`);
  }

  console.log("\nSaved to last.fm/data/3am-analysis.json");
}

analyze();
