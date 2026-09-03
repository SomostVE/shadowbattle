export function normalizeLookupValue(value) {
  return String(value ?? "").trim().toLowerCase();
}
