const VERSION = "0.4.9";
const DECK_KEY = "shadowbattle:decks:v1";

const version = document.getElementById("hub-version");
const saved = document.getElementById("hub-saved-count");
const sv1 = document.getElementById("hub-sv1-count");
const svcb = document.getElementById("hub-svcb-count");

if (version) version.textContent = `v${VERSION}`;

const library = readLibrary();
const sv1Decks = Object.keys(library?.games?.["shadowverse-ccg"]?.decks ?? {}).length;
const svcbDecks = Object.keys(library?.games?.["champions-battle"]?.decks ?? {}).length;

if (saved) saved.textContent = String(sv1Decks + svcbDecks);
if (sv1) sv1.textContent = `${sv1Decks} saved`;
if (svcb) svcb.textContent = `${svcbDecks} saved`;

function readLibrary() {
  try {
    return JSON.parse(localStorage.getItem(DECK_KEY) || "null");
  } catch {
    return null;
  }
}
