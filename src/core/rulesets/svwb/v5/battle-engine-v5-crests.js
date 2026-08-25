import { norm } from "./battle-engine-v5-utils.js";

export function hasCrest(player, name) {
  const target = norm(name);
  return (player.crests ?? []).some(crest => norm(crest.name) === target);
}

export function gainCrest(player, name, card) {
  if ((player.crests ?? []).some(crest => norm(crest.name) === norm(name))) return false;
  if ((player.crests ?? []).length >= 5) return false;
  player.crests.push({
    name,
    card,
    countdown: crestCountdown(name),
    gainedTurn: Number(player.personalTurn) || 0,
    __damageTriggerTurn: -1,
    __healTriggerTurn: -1
  });
  return true;
}

export function crestCountdown(name) {
  const normalized = norm(name);
  const countdowns = new Map([
    ["sandalphon, primarch successor", 2], ["lu woh, light personified", 2], ["krulle, heir to unkilling", 2],
    ["gildaria, anathema of attunement", 1], ["supplicant of repose", 4], ["lapis, shining seraph", 2],
    ["devotee of repose", 4], ["maddening benison", 2], ["congregant of repose", 4], ["zoe, dazzling hope", 1],
    ["himeka, heir to repose", 4], ["majestic conquest", 2], ["kagemitsu, enduring warrior", 2],
    ["octrice, hollowness manifest", 8], ["unkei, goldbloom", 4], ["magnified malice", 1],
    ["minimized anxiety", 1], ["starry sky", 1], ["thestae, anathema of distortion", 3],
    ["yuel & societte, dancing duo", 4], ["great hart of the glacial realm", 3], ["crescent tube ride", 4],
    ["drache & aluzard, burning blood", 2], ["dragon's vale elder", 2], ["rigor of the nightblossom", 2],
    ["valiant edge", 2], ["balto, dusk bounty hunter", 4], ["charon, stygian oarswoman", 2],
    ["corruption", 4], ["illamrita, designated target", 2], ["eudie, maiden reborn", 3],
    ["slaus, revolving wheel of fortune", 3], ["belial, archangel of cunning", 4], ["pascale's dance", 1],
    ["insomniac witch", 2], ["crystal gazing", 2], ["juno, visionary alchemist", 3],
    ["lilanthim, anathema of predation", 1]
  ]);
  return countdowns.get(normalized) ?? null;
}
