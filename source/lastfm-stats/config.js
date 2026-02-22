const USERNAME = "mnk_400";
const API_KEY = "15606af7854e910d497469811c1ddbd4";
const BASE_URL = "https://ws.audioscrobbler.com/2.0/";
const DATA_DIR = "./data/";

// Rate limiting: Last.fm allows ~5 requests/sec
const RATE_LIMIT_MS = 220;

export { USERNAME, API_KEY, BASE_URL, DATA_DIR, RATE_LIMIT_MS };
