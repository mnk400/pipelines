// Best-effort series classifier. Titles can be English or French depending on Wikidata's labels;
// patterns cover both. Returns null when nothing matches.
const RULES = [
  ["nympheas", /nymph[éeè]as|water[\s-]?lil(?:ies|y)/i],
  ["rouen", /rouen cathedral|cath[ée]drale (?:de |of )?rouen/i],
  ["haystacks", /haystack|meule|wheatstack|grainstack|stacks? of wheat/i],
  ["poplars", /\bpoplar|peuplier/i],
  ["parliament", /houses? of parliament|westminster|le parlement/i],
  ["charing-cross", /charing[\s-]?cross/i],
  ["mornings-on-seine", /morning(?:s)? on the seine|matin(?:[ée]e?)? sur la seine|bras de la seine/i],
];

export function classifySeries(title) {
  if (!title) return null;
  for (const [name, re] of RULES) {
    if (re.test(title)) return name;
  }
  return null;
}
