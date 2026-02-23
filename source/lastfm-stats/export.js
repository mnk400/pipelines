import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

const dataDir = "data";
const outDir = process.env.OUT_DIR || "docs";

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// Genre drift — keep topGenres, monthly, quarterly, meta
const genreDrift = JSON.parse(readFileSync(`${dataDir}/genre-drift.json`));
writeFileSync(
  `${outDir}/genre-drift.json`,
  JSON.stringify({
    topGenres: genreDrift.topGenres,
    monthly: genreDrift.monthly,
    quarterly: genreDrift.quarterly,
    meta: genreDrift.meta,
  })
);
console.log("Exported genre-drift.json");

// 3AM analysis — keep topByBlock and hourlyDistribution
const am = JSON.parse(readFileSync(`${dataDir}/3am-analysis.json`));
writeFileSync(
  `${outDir}/3am-analysis.json`,
  JSON.stringify({
    topByBlock: am.topByBlock,
    hourlyDistribution: am.hourlyDistribution,
    meta: am.meta,
  })
);
console.log("Exported 3am-analysis.json");

// Mainstream analysis — keep tiers, monthly tierPct, quarterly, meta
const mainstream = JSON.parse(readFileSync(`${dataDir}/mainstream-analysis.json`));
writeFileSync(
  `${outDir}/mainstream-analysis.json`,
  JSON.stringify({
    tiers: mainstream.tiers,
    monthly: mainstream.monthly.map((m) => ({
      month: m.month,
      totalPlays: m.totalPlays,
      tierPct: m.tierPct,
    })),
    quarterly: mainstream.quarterly,
    meta: mainstream.meta,
  })
);
console.log("Exported mainstream-analysis.json");

// Artist lifecycle — keep everything (already small)
const lifecycle = JSON.parse(readFileSync(`${dataDir}/artist-lifecycle.json`));
writeFileSync(`${outDir}/artist-lifecycle.json`, JSON.stringify(lifecycle));
console.log("Exported artist-lifecycle.json");

// Discovery rate — keep monthly, quarterly, meta
const discovery = JSON.parse(readFileSync(`${dataDir}/discovery.json`));
writeFileSync(
  `${outDir}/discovery.json`,
  JSON.stringify({
    monthly: discovery.monthly,
    quarterly: discovery.quarterly,
    meta: discovery.meta,
  })
);
console.log("Exported discovery.json");
