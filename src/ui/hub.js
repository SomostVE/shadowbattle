const DECK_KEY = "shadowbattle:decks:v1";
const RULESET_KEY = "shadowbattle:hub-ruleset:v1";
const CPU_DIFFICULTY_KEY = "shadowbattle:cpu-difficulty:v1";

const CCG_BACKGROUND_ROOT = "./assets/fankits/shadowverse-ccg/extracted/Backgrounds/Backgrounds/";
const CCG_BACKGROUNDS = [
  "background_Castle.png",
  "background_DarkForest.png",
  "background_Darkstone.png",
  "background_Forest.png",
  "background_Hall.png",
  "background_Laboratory.png",
  "background_Lake.png",
  "background_Lake_Night.png",
  "background_Mansion.png",
  "background_Map.png",
  "background_Mausoleum.png",
  "background_Morning_Star.png",
  "background_Mountains.png",
  "background_Track.png",
  "background_Track_Morning.png",
  "background_Track_Night.png"
].map(name => `${CCG_BACKGROUND_ROOT}${name}`);

renderDeckCounts();
renderDatasetCounts();
renderCpuDeckCount();
applyRandomFanKitBackground();
bindGameProfileButtons();
bindCpuDifficulty();

function renderDeckCounts() {
  const library = readLibrary();
  const counts = {
    "shadowverse-ccg": Object.keys(library?.games?.["shadowverse-ccg"]?.decks ?? {}).length,
    "champions-battle": Object.keys(library?.games?.["champions-battle"]?.decks ?? {}).length,
    "worlds-beyond": Object.keys(library?.games?.["worlds-beyond"]?.decks ?? {}).length
  };

  setText("hub-sv1-player-count", counts["shadowverse-ccg"]);
  setText("hub-cb-player-count", counts["champions-battle"]);
  setText("hub-wb-player-count", counts["worlds-beyond"]);
  setText("hub-saved-count", counts["shadowverse-ccg"] + counts["champions-battle"] + counts["worlds-beyond"]);
}

async function renderDatasetCounts() {
  const sources = [
    ["hub-sv1-card-count", "./api/v1/shadowverse-ccg/manifest.json", payload => payload.cardCount],
    ["hub-cb-card-count", "./api/v1/champions-battle/manifest.json", payload => payload.cardCount],
    ["hub-wb-card-count", "https://somostve.github.io/beyond_codex/api/v1/manifest.json", payload => payload.counts?.cards]
  ];

  await Promise.all(sources.map(async ([targetId, url, readCount]) => {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      const count = Number(readCount(payload));
      if (Number.isFinite(count)) setText(targetId, formatCount(count));
    } catch {
      // Static counters stay visible if a manifest is temporarily unavailable.
    }
  }));
}

async function renderCpuDeckCount() {
  try {
    const response = await fetch("./api/v1/worlds-beyond/bot-decks.json", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    setText("hub-wb-bot-count", payload.decks?.length ?? 0);
  } catch {
    // Static counter stays visible if the synchronized pool is unavailable.
  }
}

function bindGameProfileButtons() {
  const buttons = [...document.querySelectorAll(".hub-game[data-game]")];
  if (buttons.length === 0) return;

  const saved = localStorage.getItem(RULESET_KEY);
  const selected = buttons.find(button => button.dataset.game === saved)
    ?? buttons.find(button => button.dataset.game === "worlds-beyond")
    ?? buttons[0];

  selectRuleset(selected, buttons, false);

  buttons.forEach(button => {
    button.addEventListener("click", () => selectRuleset(button, buttons, true));
  });
}

function selectRuleset(button, buttons, persist) {
  buttons.forEach(item => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });

  const game = String(button.dataset.game || "worlds-beyond");
  document.body.dataset.ruleset = game;
  if (persist) localStorage.setItem(RULESET_KEY, game);
}

function bindCpuDifficulty() {
  const buttons = [...document.querySelectorAll("[data-cpu-difficulty]")];
  if (buttons.length === 0) return;

  const saved = localStorage.getItem(CPU_DIFFICULTY_KEY);
  const selected = buttons.find(button => button.dataset.cpuDifficulty === saved)
    ?? buttons.find(button => button.dataset.cpuDifficulty === "intermediate")
    ?? buttons[0];

  selectCpuDifficulty(selected, buttons, false);

  buttons.forEach(button => {
    button.addEventListener("click", () => selectCpuDifficulty(button, buttons, true));
  });
}

function selectCpuDifficulty(button, buttons, persist) {
  buttons.forEach(item => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });

  const difficulty = String(button.dataset.cpuDifficulty || "intermediate");
  document.body.dataset.cpuDifficulty = difficulty;
  if (persist) localStorage.setItem(CPU_DIFFICULTY_KEY, difficulty);
}

async function applyRandomFanKitBackground() {
  const worldsBeyond = await readWorldsBeyondBackgrounds();
  const pool = [...CCG_BACKGROUNDS, ...worldsBeyond];
  if (pool.length === 0) return;

  const start = Math.floor(Math.random() * pool.length);
  for (let offset = 0; offset < pool.length; offset++) {
    const candidate = pool[(start + offset) % pool.length];
    if (await imageExists(candidate)) {
      document.documentElement.style.setProperty("--hub-bg-image", `url("${candidate}")`);
      return;
    }
  }
}

async function readWorldsBeyondBackgrounds() {
  try {
    const root = new URL("./assets/fankits/worlds-beyond/", location.href);
    const response = await fetch(new URL("manifest.json", root), { cache: "no-store" });
    if (!response.ok) return [];
    const manifest = await response.json();

    const declared = Array.isArray(manifest.backgrounds) ? manifest.backgrounds : [];
    const archivedImages = Array.isArray(manifest.files)
      ? manifest.files
          .filter(entry => entry?.kind === "background" || /(?:background|\bbg\b)/i.test(String(entry?.file ?? "")))
          .map(entry => String(entry?.file ?? ""))
          .filter(file => /\.(?:png|jpe?g|webp)$/i.test(file))
      : [];

    return [...new Set([...declared, ...archivedImages])]
      .map(file => new URL(file, root).href);
  } catch {
    return [];
  }
}

function imageExists(src) {
  return new Promise(resolve => {
    const image = new Image();
    const done = value => {
      image.onload = null;
      image.onerror = null;
      resolve(value);
    };
    image.onload = () => done(true);
    image.onerror = () => done(false);
    image.src = src;
  });
}

function setText(id, value) {
  const target = document.getElementById(id);
  if (target) target.textContent = String(value);
}

function formatCount(value) {
  return Number(value).toLocaleString("en-US");
}

function readLibrary() {
  try {
    return JSON.parse(localStorage.getItem(DECK_KEY) || "null");
  } catch {
    return null;
  }
}
