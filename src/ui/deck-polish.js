(() => {
  const results = document.getElementById("deck-results");
  const save = document.getElementById("save-deck");
  const name = document.getElementById("deck-name");

  // Reaching the normal 3-copy / 40-card cap is expected deckbuilder behavior,
  // not an error state. Stop the add action before the main page emits a toast.
  results?.addEventListener("click", event => {
    const add = event.target.closest?.("[data-add]");
    if (!add || !results.contains(add)) return;
    const tile = add.closest(".db-card-tile");
    const total = Number.parseInt(document.getElementById("current-deck-count")?.textContent ?? "0", 10) || 0;
    if (!tile?.classList.contains("is-capped") && total < 40) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  // Saving now lives in the Saved tab like Beyond Decks. Keep an empty variant
  // name local to that panel rather than bouncing the user back to Deck.
  save?.addEventListener("click", event => {
    if (name?.value.trim()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    name?.focus();
  }, true);
})();
