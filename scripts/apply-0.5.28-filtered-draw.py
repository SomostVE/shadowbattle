from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"missing patch anchor in {path}: {old[:140]!r}")
    p.write_text(text.replace(old, new, 1))


commands = "src/core/rulesets/svwb/v6/effect-commands.js"
replace_once(
    commands,
    '''export function createWorldsBeyondFilteredDrawCommand(playerIndex, {
  amount = 1,
  cardClass = null,
  cardType = null,
  cardName = null,
  allMatches = false,
  grantKeyword = null
} = {}, options = {}) {
  return createWorldsBeyondEffectCommand(SVWB_EFFECT_COMMAND.DRAW_FILTERED, {
    playerIndex,
    amount: Math.max(0, Number(amount) || 0),
    cardClass,
    cardType,
    cardName,
    allMatches: Boolean(allMatches),
''',
    '''export function createWorldsBeyondFilteredDrawCommand(playerIndex, {
  amount = 1,
  cardClass = null,
  cardType = null,
  cardName = null,
  baseCost = null,
  allMatches = false,
  grantKeyword = null
} = {}, options = {}) {
  return createWorldsBeyondEffectCommand(SVWB_EFFECT_COMMAND.DRAW_FILTERED, {
    playerIndex,
    amount: Math.max(0, Number(amount) || 0),
    cardClass,
    cardType,
    cardName,
    baseCost: baseCost == null ? null : Math.max(0, Number(baseCost) || 0),
    allMatches: Boolean(allMatches),
'''
)

trailing_anchor = '''  const typed = value.match(/\\bdraw\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+([a-z]+craft)\\s+(followers?)\\s*\\.?\\s*$/i);
  if (typed) {
    return [createWorldsBeyondFilteredDrawCommand(playerIndex, {
      amount: numberWord(typed[1]),
      cardClass: typed[2],
      cardType: singularType(typed[3])
    }, sourceOptions)];
  }

  const named = value.match(/\\bdraw\\s+(?:a|an|one)\\s+([A-Z][A-Za-z0-9'’&,:\\- ]+?)\\s*\\.?\\s*$/);
'''
trailing_replacement = '''  const typed = value.match(/\\bdraw\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+([a-z]+craft)\\s+(followers?)\\s*\\.?\\s*$/i);
  if (typed) {
    return [createWorldsBeyondFilteredDrawCommand(playerIndex, {
      amount: numberWord(typed[1]),
      cardClass: typed[2],
      cardType: singularType(typed[3])
    }, sourceOptions)];
  }

  const classOnly = value.match(/\\bdraw\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+(Neutral|[a-z]+craft)\\s+cards?\\s*\\.?\\s*$/i);
  if (classOnly) {
    return [createWorldsBeyondFilteredDrawCommand(playerIndex, {
      amount: numberWord(classOnly[1]),
      cardClass: classOnly[2]
    }, sourceOptions)];
  }

  const costTyped = value.match(/\\bdraw\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+(\\d+)-cost\\s+(amulets?|spells?|followers?)\\s*\\.?\\s*$/i);
  if (costTyped) {
    return [createWorldsBeyondFilteredDrawCommand(playerIndex, {
      amount: numberWord(costTyped[1]),
      baseCost: Number(costTyped[2]),
      cardType: singularType(costTyped[3])
    }, sourceOptions)];
  }

  const named = value.match(/\\bdraw\\s+(?:a|an|one)\\s+([A-Z][A-Za-z0-9'’&,:\\- ]+?)\\s*\\.?\\s*$/i);
'''
replace_once(commands, trailing_anchor, trailing_replacement)

replace_once(
    commands,
    '''function resolveFilteredDraw(session, playerIndex, payload) {
  const player = session.getPlayer(playerIndex);
  const wantedClass = normalize(payload.cardClass);
  const wantedType = normalize(payload.cardType);
  const wantedName = normalize(payload.cardName);
  const allMatches = Boolean(payload.allMatches);
  const initialMatches = player.deck.filter(item => {
    const card = item?.card ?? item;
    return (!wantedClass || normalize(card?.class) === wantedClass)
      && (!wantedType || normalize(card?.type) === wantedType)
      && (!wantedName || normalize(card?.name) === wantedName);
  }).length;
''',
    '''function resolveFilteredDraw(session, playerIndex, payload) {
  const player = session.getPlayer(playerIndex);
  const wantedClass = normalize(payload.cardClass);
  const wantedType = normalize(payload.cardType);
  const wantedName = normalize(payload.cardName);
  const wantedBaseCost = payload.baseCost == null ? null : Math.max(0, Number(payload.baseCost) || 0);
  const allMatches = Boolean(payload.allMatches);
  const initialMatches = player.deck.filter(item => {
    const card = item?.card ?? item;
    return (!wantedClass || normalize(card?.class) === wantedClass)
      && (!wantedType || normalize(card?.type) === wantedType)
      && (!wantedName || normalize(card?.name) === wantedName)
      && (wantedBaseCost == null || Math.max(0, Number(card?.cost) || 0) === wantedBaseCost);
  }).length;
'''
)
replace_once(
    commands,
    '''        return (!wantedClass || normalize(card?.class) === wantedClass)
          && (!wantedType || normalize(card?.type) === wantedType)
          && (!wantedName || normalize(card?.name) === wantedName);
''',
    '''        return (!wantedClass || normalize(card?.class) === wantedClass)
          && (!wantedType || normalize(card?.type) === wantedType)
          && (!wantedName || normalize(card?.name) === wantedName)
          && (wantedBaseCost == null || Math.max(0, Number(card?.cost) || 0) === wantedBaseCost);
'''
)

resolver = "src/core/rulesets/svwb/effect-resolver.js"
replace_once(
    resolver,
    '''const TRAILING_TYPED_DRAW = /\\bdraw\\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+[a-z]+craft\\s+followers?\\s*\\.?\\s*$/i;
const TRAILING_NAMED_DRAW = /\\bdraw\\s+(?:a|an|one)\\s+[A-Z][A-Za-z0-9'’&,:\\- ]+?\\s*\\.?\\s*$/;
''',
    '''const TRAILING_TYPED_DRAW = /\\bdraw\\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+[a-z]+craft\\s+followers?\\s*\\.?\\s*$/i;
const TRAILING_CLASS_DRAW = /\\bdraw\\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+(?:Neutral|[a-z]+craft)\\s+cards?\\s*\\.?\\s*$/i;
const TRAILING_COST_TYPED_DRAW = /\\bdraw\\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+\\d+-cost\\s+(?:amulets?|spells?|followers?)\\s*\\.?\\s*$/i;
const TRAILING_NAMED_DRAW = /\\bdraw\\s+(?:a|an|one)\\s+[A-Z][A-Za-z0-9'’&,:\\- ]+?\\s*\\.?\\s*$/i;
'''
)
replace_once(
    resolver,
    '''    new RegExp(TRAILING_TYPED_DRAW.source, "gi"),
    new RegExp(TRAILING_NAMED_DRAW.source, "g"),
''',
    '''    new RegExp(TRAILING_TYPED_DRAW.source, "gi"),
    new RegExp(TRAILING_CLASS_DRAW.source, "gi"),
    new RegExp(TRAILING_COST_TYPED_DRAW.source, "gi"),
    new RegExp(TRAILING_NAMED_DRAW.source, "gi"),
'''
)

for path in [
    "package.json",
    "version.json",
    "index.html",
    "api/index.html",
    "test/index.html",
    "decks/index.html",
    "library/index.html"
]:
    p = Path(path)
    text = p.read_text()
    if "0.5.27" in text:
        p.write_text(text.replace("0.5.27", "0.5.28"))

if '"version": "0.5.28"' not in Path("package.json").read_text():
    raise SystemExit("package version did not update")
if '"version": "0.5.28"' not in Path("version.json").read_text():
    raise SystemExit("public version did not update")
