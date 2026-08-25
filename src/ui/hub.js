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

const saved = document.getElementById("hub-saved-count");
const library = readLibrary();
const sv1Decks = Object.keys(library?.games?.["shadowverse-ccg"]?.decks ?? {}).length;
const svcbDecks = Object.keys(library?.games?.["champions-battle"]?.decks ?? {}).length;
const total = sv1Decks + svcbDecks;

if (saved) saved.textContent = `${total} saved`;

applyRandomFanKitBackground();

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
          .filter(file => /background/i.test(file) && /\.(?:png|jpe?g|webp)$/i.test(file))
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
