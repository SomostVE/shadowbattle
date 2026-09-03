export function currentAttack(instance) {
  return Number(instance?.attack ?? (Number(instance?.card?.attack ?? 0) + Number(instance?.attackBonus ?? 0)));
}

export function currentDefense(instance) {
  return Number(instance?.defense ?? (Number(instance?.card?.defense ?? 0) + Number(instance?.defenseBonus ?? 0)));
}

export function currentMaxDefense(instance) {
  return Number(instance?.maxDefense ?? currentDefense(instance));
}

export function currentMaxDefenseIgnoringDamage(instance) {
  return Number(instance?.maxDefense ?? (Number(instance?.card?.defense ?? 0) + Number(instance?.defenseBonus ?? 0)));
}

export function cardType(instance) {
  return String(instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}

export function effectiveCardType(instance) {
  return String(instance?.typeOverride ?? instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}

export function cardHasTrait(card, trait) {
  const wanted = String(trait ?? "").trim().toLowerCase();
  return (card?.traits ?? []).some(value => String(value ?? "").trim().toLowerCase() === wanted);
}
