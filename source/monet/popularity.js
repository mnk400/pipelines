export function isCatalogScan(filename = "") {
  return /(?:^|[ _-])Wildenstein[ _-]1996/i.test(filename);
}

export function buildPopularity({ sitelinks = 0, commons_globalusage = 0, source = "wikidata", image_filename = "" }) {
  const wikidataSitelinks = Number(sitelinks) || 0;
  const commonsGlobalusage = Number(commons_globalusage) || 0;
  const sourceBonus = source === "wikidata" ? 8 : 4;
  const imageQualityBonus = isCatalogScan(image_filename) ? 0 : 5;

  const score =
    60 * Math.log1p(wikidataSitelinks) +
    35 * Math.log1p(commonsGlobalusage) +
    sourceBonus +
    imageQualityBonus;

  return {
    score: Math.round(score * 10) / 10,
    sitelinks: wikidataSitelinks,
    wikidata_sitelinks: wikidataSitelinks,
    globalusage: commonsGlobalusage,
    commons_globalusage: commonsGlobalusage,
    source_bonus: sourceBonus,
    image_quality_bonus: imageQualityBonus,
  };
}
