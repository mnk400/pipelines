import { existsSync, readFileSync } from "node:fs";

const DEFAULT_CONFIG_PATH = "artist.json";
const DEFAULT_DATA_DIR = "data";

function required(value, label) {
  if (!value) throw new Error(`Missing required artist config field: ${label}`);
  return value;
}

export function loadArtistConfig() {
  const path = process.env.ARTIST_CONFIG || DEFAULT_CONFIG_PATH;
  if (!existsSync(path)) {
    throw new Error(`Artist config not found: ${path}`);
  }

  const config = JSON.parse(readFileSync(path, "utf8"));
  required(config.artist?.qid, "artist.qid");
  required(config.artist?.name, "artist.name");

  return {
    ...config,
    work: {
      qid: "Q3305213",
      label: "paintings",
      manifestKey: "paintings",
      ...(config.work ?? {}),
    },
    seriesRules: config.seriesRules ?? [],
    commonsGallery: config.commonsGallery ?? null,
    commonsCategory: config.commonsCategory ?? null,
  };
}

export function userAgent(config) {
  return config.userAgent || "manik.cc-paintings-pipeline/0.1 (https://manik.cc; mnk_400@yahoo.com)";
}

export function dataPath(filename) {
  return `${process.env.DATA_DIR || DEFAULT_DATA_DIR}/${filename}`;
}
