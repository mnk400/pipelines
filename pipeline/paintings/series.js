export function classifySeries(title, rules = []) {
  if (!title) return null;
  for (const rule of rules) {
    const name = rule.name;
    const re = new RegExp(rule.pattern, rule.flags ?? "i");
    if (re.test(title)) return name;
  }
  return null;
}
