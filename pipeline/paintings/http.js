// Wikidata and Commons both throttle aggressively from CI runner IPs.
// Retries 429 and 503 with Retry-After awareness; otherwise exponential backoff.
export async function fetchJson(url, init = {}, attempts = 5) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      lastErr = err;
      const wait = Math.min(2 ** i, 30) * 1000;
      console.warn(`Network error on attempt ${i + 1}/${attempts}: ${err.message}; retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (res.ok) return res.json();
    if (res.status !== 429 && res.status !== 503) {
      throw new Error(`${res.status} ${res.statusText} for ${url}`);
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const wait = (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2 ** i) * 1000;
    console.warn(`${res.status} on attempt ${i + 1}/${attempts}; retrying in ${wait / 1000}s`);
    lastErr = new Error(`${res.status} ${res.statusText}`);
    await new Promise((r) => setTimeout(r, Math.min(wait, 60000)));
  }
  throw lastErr || new Error(`Exhausted retries for ${url}`);
}
