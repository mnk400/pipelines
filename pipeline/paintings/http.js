// Wikidata and Commons both throttle aggressively from CI runner IPs.
// Retry transient throttling/server failures with Retry-After awareness; otherwise exponential backoff.
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function retryDelayMs(res, attempt) {
  const retryAfter = Number(res.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;

  const exponential = Math.min(2 ** attempt, 60) * 1000;
  const jitter = Math.floor(Math.random() * 1000);
  return exponential + jitter;
}

export async function fetchJson(url, init = {}, attempts = 7) {
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
    if (!RETRYABLE_STATUS.has(res.status)) {
      throw new Error(`${res.status} ${res.statusText} for ${url}`);
    }
    const wait = retryDelayMs(res, i);
    console.warn(`${res.status} on attempt ${i + 1}/${attempts}; retrying in ${wait / 1000}s`);
    lastErr = new Error(`${res.status} ${res.statusText}`);
    await new Promise((r) => setTimeout(r, Math.min(wait, 60000)));
  }
  throw lastErr || new Error(`Exhausted retries for ${url}`);
}
