(() => {
  const results = document.getElementById("deck-results");
  const save = document.getElementById("save-deck");
  const name = document.getElementById("deck-name");
  const saved = document.getElementById("saved-decks");

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

  save?.addEventListener("click", event => {
    if (name?.value.trim()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    name?.focus();
  }, true);

  // The deckbuilder now edits only original Shadowverse and Champion's Battle.
  // Preserve old svwb records in localStorage, but do not surface them here.
  const hideWorldsBeyondRow = row => {
    if (!(row instanceof Element) || !row.matches(".db-saved-row")) return;
    const meta = row.querySelector("small")?.textContent ?? "";
    if (/Worlds Beyond/i.test(meta)) row.hidden = true;
  };

  const inspectAddedNode = node => {
    if (!(node instanceof Element)) return;
    hideWorldsBeyondRow(node);
    for (const row of node.querySelectorAll(".db-saved-row")) hideWorldsBeyondRow(row);
  };

  if (saved) {
    for (const row of saved.querySelectorAll(".db-saved-row")) hideWorldsBeyondRow(row);
    new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) inspectAddedNode(node);
      }
    }).observe(saved, { childList: true });
  }
})();
