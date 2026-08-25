const DECK_KEY = "shadowbattle:decks:v1";

const CCG_BACKGROUNDS = [
  "./assets/fankits/shadowverse-ccg/extracted/Backgrounds/Backgrounds/background_Castle.png",
  "./assets/fankits/shadowverse-ccg/extracted/Backgrounds/Backgrounds/background_DarkForest.png",
  "./assets/fankits/shadowverse-ccg/extracted/Backgrounds/Backgrounds/background_Darkstone.png",
  "./assets/fankits/shadowverse-ccg/extracted/Backgrounds/Backgrounds/background_Forest.png",
  "./assets/fankits/shadowverse-ccg/extracted/Backgrounds/Backgrounds/background_Hall.png",
  "./assets/fankits/shadowverse-ccg/extracted/Backgrounds/Backgrounds/background_Laboratory.png",
  "./assets/fankits/shadowverse-ccg/extracted/Backgrounds/Backgrounds/background_Lake.png",
  "./assets/fankits/shadowverse-ccg/extracted/Backgrounds/Backgrounds/background_Lake_Night.png",
  "./assets/fankits/shadowverse-ccg/extracted/Backgrounds/Backgrounds/background_Mansion.png",
  "./assets/fankits/shadowverse-ccg/extracted/Backgrounds/Backgrounds/background_Map.png"
];

renderSavedCount();
renderBotDeckCount();
applyRandomFanKitBackground();
bindGameProfileButtons();

function renderSavedCount() {
  const saved = document.getElementById("hub-saved-count");
  if (!saved) return;
  const library = readLibrary();
  const sv1Decks = Object.keys(library?.games?.["shadowverse-ccg"]?.decks ?? {}).length;
  const svcbDecks = Object.keys(library?.games?.["champions-battle"]?.decks ?? {}).length;
  saved.textContent = String(sv1Decks + svcbDecks);
}

async function renderBotDeckCount() {
  const target = document.getElementById("hub-wb-bot-count");
  if (!target) return;
  try {
    const response = await fetch("./api/v1/worlds-beyond/bot-decks.json", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    target.textContent = String(payload.decks?.length ?? 0);
  } catch {
    // Keep the static fallback when the synchronized pool is temporarily unavailable.
  }
}

function bindGameProfileButtons() {
  const buttons = [...document.querySelectorAll(".hub-game[data-game]")];
  buttons.forEach(button => {
    button.addEventListener("click", () => {
      if (button.classList.contains("muted")) return;
      buttons.forEach(item => item.classList.toggle("active", item === button));
    });
  });
}

async function applyRandomFanKitBackground() {
  const pool = [...CCG_BACKGROUNDS, ...await readWorldsBeyondBackgrounds()];
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
    const response = await fetch("./assets/fankits/worlds-beyond/manifest.json", { cache: "no-store" });
    if (!response.ok) return [];
    const manifest = await response.json();

    const declared = Array.isArray(manifest.backgrounds) ? manifest.backgrounds : [];
    const archivedImages = Array.isArray(manifest.files)
      ? manifest.files
          .map(entry => String(entry?.file ?? ""))
          .filter(file => /(?:background|\bbg\b)/i.test(file) && /\.(?:png|jpe?g|webp)$/i.test(file))
      : [];

    return [...declared, ...archivedImages]
      .map(file => new URL(file, new URL("./assets/fankits/worlds-beyond/", location.href)).href);
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

function readLibrary() {
  try {
    return JSON.parse(localStorage.getItem(DECK_KEY) || "null");
  } catch {
    return null;
  }
}
