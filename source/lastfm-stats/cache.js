import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { DATA_DIR } from "./config.js";

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

function cachePath(name) {
  return `${DATA_DIR}${name}.json`;
}

export function loadCache(name) {
  const path = cachePath(name);
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf-8"));
  }
  return null;
}

export function saveCache(name, data) {
  writeFileSync(cachePath(name), JSON.stringify(data, null, 2));
}
