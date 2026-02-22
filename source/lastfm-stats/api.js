import { API_KEY, BASE_URL, USERNAME, RATE_LIMIT_MS } from "./config.js";

let lastRequestTime = 0;

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function apiCall(method, params = {}) {
  await rateLimit();
  const url = new URL(BASE_URL);
  url.searchParams.set("method", method);
  url.searchParams.set("user", USERNAME);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getWeeklyChartList() {
  const data = await apiCall("user.getweeklychartlist");
  return data.weeklychartlist.chart;
}

export async function getWeeklyArtistChart(from, to) {
  const data = await apiCall("user.getweeklyartistchart", { from, to });
  return data.weeklyartistchart.artist || [];
}

export async function getRecentTracks(page = 1, limit = 200) {
  const data = await apiCall("user.getrecenttracks", {
    page: String(page),
    limit: String(limit),
    extended: "0",
  });
  return data.recenttracks;
}

export async function getArtistInfo(artist) {
  await rateLimit();
  const url = new URL(BASE_URL);
  url.searchParams.set("method", "artist.getinfo");
  url.searchParams.set("artist", artist);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("format", "json");
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.error) return null;
  return {
    listeners: parseInt(data.artist?.stats?.listeners || "0", 10),
    playcount: parseInt(data.artist?.stats?.playcount || "0", 10),
  };
}

export async function getArtistTopTags(artist) {
  await rateLimit();
  const url = new URL(BASE_URL);
  url.searchParams.set("method", "artist.gettoptags");
  url.searchParams.set("artist", artist);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("format", "json");
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  if (data.error) return [];
  return (data.toptags?.tag || []).slice(0, 10).map((t) => ({
    name: t.name.toLowerCase(),
    count: parseInt(t.count, 10),
  }));
}
