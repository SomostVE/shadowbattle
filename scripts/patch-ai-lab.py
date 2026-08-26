from pathlib import Path

path = Path("src/test/battle-action-lab.js")
text = path.read_text()

replacements = [
    (
        'import { loadReferenceDecks } from "../ai/reference-decks.js";\n',
        'import { createIntermediateController } from "../ai/intermediate-controller.js";\nimport { loadReferenceDecks } from "../ai/reference-decks.js";\n',
    ),
    (
        'let dataReady = false;\nlet queue = createQueue();\n',
        'let dataReady = false;\nlet queue = createQueue();\nlet cpuController = null;\n',
    ),
    (
        '  if (!humanDeck || !cpuDeck) return;\n\n  eventCursor = 0;\n',
        '  if (!humanDeck || !cpuDeck) return;\n\n  cpuController = createIntermediateController({\n    seed: `${ui.seed.value || "shadowbattle-action-lab"}:cpu:1`,\n    strategy: cpuDeck.strategy\n  });\n  eventCursor = 0;\n',
    ),
    (
        '  session.start();\n  const threshold = Number(cpuDeck.strategy?.mulliganMaxCost ?? 3);\n  const cpuReplace = session.players[1].hand.filter(item => Number(item.card?.cost ?? 0) > threshold).map(item => item.instanceId);\n  session.submitMulligan(1, cpuReplace);\n',
        '  session.start();\n  session.submitMulligan(1, cpuController.chooseMulligan(session, 1));\n',
    ),
]

old_loop = '''    for (let step = 0; step < 24 && session.phase === GAME_PHASE.MAIN && session.activePlayer === 1; step += 1) {
      const actions = legalActions(1);
      const action = chooseCpuAction(actions);
      if (!action && shouldCpuUseBonusPp()) {
        session.useBonusPp(1);
        await consumeEvents();
        render();
        await pause(120);
        continue;
      }
      if (!action) break;
      session.dispatch(action);
      await consumeEvents();
      render();
      await pause(90);
    }
'''
new_loop = '''    for (let step = 0; step < 24 && session.phase === GAME_PHASE.MAIN && session.activePlayer === 1; step += 1) {
      if (cpuController?.shouldUseBonusPp(session, 1)) {
        session.useBonusPp(1);
        await consumeEvents();
        render();
        await pause(120);
        continue;
      }
      const decision = cpuController?.chooseAction(session, 1) ?? null;
      const action = decision?.action ?? null;
      if (!action) break;
      session.dispatch(action);
      await consumeEvents();
      render();
      await pause(90);
    }
'''
replacements.append((old_loop, new_loop))

old_helpers = '''function chooseCpuAction(actions) {
  const fuse = actions
    .filter(action => action.type === "fuse")
    .sort((a, b) => Number(Boolean(b.projectedTransform)) - Number(Boolean(a.projectedTransform)) || (b.materialInstanceIds?.length ?? 0) - (a.materialInstanceIds?.length ?? 0))[0];
  if (fuse?.projectedTransform) return fuse;

  const play = actions
    .filter(action => action.type === "play-card")
    .sort((a, b) => b.cost - a.cost || modePriority(b) - modePriority(a) || playTargetValue(1, b) - playTargetValue(1, a))[0];
  if (play) return play;
  if (fuse && session.players[1].hand.length >= 7) return fuse;

  const engage = actions
    .filter(action => action.type === "engage")
    .sort((a, b) => b.cost - a.cost || targetValue(0, b.targetInstanceId) - targetValue(0, a.targetInstanceId))[0];
  if (engage) return engage;
  const superEvolution = actions.filter(action => action.type === "super-evolve");
  if (superEvolution.length) return bestEvolution(superEvolution, 1);
  const evolution = actions.filter(action => action.type === "evolve");
  if (evolution.length) return bestEvolution(evolution, 1);
  const attacks = actions.filter(action => action.type === "attack");
  const lethal = attacks.find(action => action.target === "leader" && attackValue(1, action.attackerInstanceId) >= session.players[0].hp);
  if (lethal) return lethal;
  const wardOrTrade = attacks.filter(action => action.targetInstanceId).sort((a, b) => targetValue(0, b.targetInstanceId) - targetValue(0, a.targetInstanceId))[0];
  if (wardOrTrade) return wardOrTrade;
  return attacks.find(action => action.target === "leader") ?? null;
}

function modePriority(action) {
  if (action.playMode?.enhanced) return 4;
  if (action.playMode?.crystallized) return 3;
  if (action.playMode?.accelerated) return 2;
  if (action.playMode?.kind === "mode") return 1;
  return 0;
}

function bestEvolution(actions, playerIndex) {
  const enemyIndex = 1 - playerIndex;
  return [...actions].sort((a, b) =>
    attackValue(playerIndex, b.followerInstanceId) - attackValue(playerIndex, a.followerInstanceId)
    || targetValue(enemyIndex, b.targetInstanceId) - targetValue(enemyIndex, a.targetInstanceId)
  )[0] ?? null;
}

function shouldCpuUseBonusPp() {
  const player = session.players[1];
  if (!player.resources.bonusPpAvailable) return false;
  const currentPp = Number(player.resources.pp ?? 0);
  return player.hand.some(item => Number(item.card?.cost ?? 0) === currentPp + 1);
}

function attackValue(playerIndex, instanceId) {
  return Number(session.findBoardCard(playerIndex, instanceId)?.attack ?? 0);
}

function playTargetValue(playerIndex, action) {
  if (!action?.targetInstanceId) return 0;
  if (session.findBoardCard(playerIndex, action.targetInstanceId)) {
    const value = targetValue(playerIndex, action.targetInstanceId);
    return action.targetKind === "damage" ? -value : value;
  }
  return targetValue(1 - playerIndex, action.targetInstanceId);
}

function targetValue(playerIndex, instanceId) {
  if (!instanceId) return 0;
  const target = session.findBoardCard(playerIndex, instanceId);
  return Number(target?.attack ?? 0) * 2 + Number(target?.defense ?? 0);
}

'''
replacements.append((old_helpers, ""))
replacements.append((
    '      ui.help.textContent = "CPU is executing legal GameSession actions. The full V5 planner will replace this temporary policy.";\n',
    '      ui.help.textContent = "CPU is executing the V6 Intermediate controller over the legal GameSession action graph.";\n',
))

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"Expected Battle Lab block not found: {old[:120]!r}")
    text = text.replace(old, new, 1)

path.write_text(text)
