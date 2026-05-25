export function isCatalogScan(filename = "") {
  return /(?:^|[ _-])Wildenstein[ _-]1996/i.test(filename);
}

// Popularity ≈ how recognizable the painting is to a human visitor.
// Primary signal: Wikipedia pageviews over the trailing 12 months, summed
// across all language editions. Direct measurement of human interest.
// Tiebreakers: Wikidata sitelinks (editorial recognition — does each language
// bother to have an article) and Commons globalusage (image reuse across
// wikis). Both are weaker because they measure activity, not attention.
export function buildPopularity({
  pageviews_365d = 0,
  sitelinks = 0,
  commons_globalusage = 0,
} = {}) {
  const pageviews = Number(pageviews_365d) || 0;
  const wikidataSitelinks = Number(sitelinks) || 0;
  const commonsGlobalusage = Number(commons_globalusage) || 0;

  const score =
    25 * Math.log1p(pageviews) +
    10 * Math.log1p(wikidataSitelinks) +
    10 * Math.log1p(commonsGlobalusage);

  return {
    score: Math.round(score * 10) / 10,
    pageviews_365d: pageviews,
    sitelinks: wikidataSitelinks,
    globalusage: commonsGlobalusage,
  };
}
