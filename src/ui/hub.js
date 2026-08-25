const DECK_KEY = "shadowbattle:decks:v1";

const saved = document.getElementById("hub-saved-count");
const library = readLibrary();
const sv1Decks = Object.keys(library?.games?.["shadowverse-ccg"]?.decks ?? {}).length;
const svcbDecks = Object.keys(library?.games?.["champions-battle"]?.decks ?? {}).length;
const total = sv1Decks + svcbDecks;

if (saved) saved.textContent = `${total} saved`;

function readLibrary() {
  try {
    return JSON.parse(localStorage.getItem(DECK_KEY) || "null");
  } catch {
    return null;
  }
}
