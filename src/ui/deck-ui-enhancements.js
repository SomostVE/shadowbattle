(() => {
  const PORTAL_CLASS_ASSET = "https://shadowverse-portal.com/public/assets/image/cards/en/classes";
  const CRAFT_CLASS_IDS = Object.freeze({
    Neutral: 0,
    Forestcraft: 1,
    Swordcraft: 2,
    Runecraft: 3,
    Dragoncraft: 4,
    Shadowcraft: 5,
    Bloodcraft: 6,
    Havencraft: 7,
    Portalcraft: 8
  });
  const FALLBACK_GLYPHS = Object.freeze({
    Neutral: "N",
    Forestcraft: "F",
    Swordcraft: "S",
    Runecraft: "R",
    Dragoncraft: "D",
    Shadowcraft: "Sh",
    Bloodcraft: "B",
    Havencraft: "H",
    Portalcraft: "P"
  });
  const CARD_SIZE_KEY = "shadowbattle:card-size";
  const CARD_SIZE_MODE_KEY = "shadowbattle:card-size-mode";
  const BEYOND_CARD_SIZE_KEY = "svwb-card-size";
  const BEYOND_CARD_SIZE_MODE_KEY = "svwb-card-size-mode";
  const CARD_POOL_MODE_KEY = "shadowbattle:card-pool-mode";

  installNeutralControl();
  upgradeOfficialCraftButtons();
  installDeferredCardArtLoader();
  installBeyondDecksSizing();

  function officialCraftIcon(craft) {
    if (!Object.prototype.hasOwnProperty.call(CRAFT_CLASS_IDS, craft)) return null;
    return `${PORTAL_CLASS_ASSET}/${CRAFT_CLASS_IDS[craft]}/class_checkbox.png`;
  }

  function installNeutralControl() {
    const root = document.getElementById("deck-craft-buttons");
    if (!root) return;

    const getMode = () => localStorage.getItem(CARD_POOL_MODE_KEY) === "neutral" ? "neutral" : "class";
    const setMode = mode => localStorage.setItem(CARD_POOL_MODE_KEY, mode === "neutral" ? "neutral" : "class");
    const refreshCards = () => document.getElementById("deck-search")?.dispatchEvent(new Event("input", { bubbles: true }));

    const sync = button => {
      const neutral = getMode() === "neutral";
      root.classList.toggle("neutral-mode", neutral);
      button.classList.toggle("active", neutral);
      button.setAttribute("aria-pressed", neutral ? "true" : "false");
      button.title = "Neutral cards";
      button.setAttribute("aria-label", "Show Neutral cards");
    };

    const ensure = () => {
      let button = root.querySelector("[data-neutral-toggle]");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "db-craft-button db-neutral-toggle";
        button.dataset.neutralToggle = "true";
        button.dataset.craftVisual = "Neutral";
        button.style.setProperty("--craft-rgb", "174, 184, 199");
        button.textContent = FALLBACK_GLYPHS.Neutral;
        root.appendChild(button);
      }
      sync(button);
    };

    root.addEventListener("click", event => {
      const neutralButton = event.target.closest("[data-neutral-toggle]");
      if (neutralButton && root.contains(neutralButton)) {
        event.preventDefault();
        event.stopPropagation();
        setMode("neutral");
        sync(neutralButton);
        refreshCards();
        return;
      }

      const classButton = event.target.closest("[data-craft]");
      if (!classButton || !root.contains(classButton)) return;
      if (getMode() !== "class") {
        setMode("class");
        const button = root.querySelector("[data-neutral-toggle]");
        if (button) sync(button);
        // Clicking the already-selected craft while viewing Neutral would make
        // the main craft handler no-op. Refresh it here so class ↔ Neutral is
        // seamless in both directions.
        if (classButton.classList.contains("active")) refreshCards();
      }
    }, true);

    new MutationObserver(ensure).observe(root, { childList: true });
    ensure();
  }

  function upgradeOfficialCraftButtons() {
    const root = document.getElementById("deck-craft-buttons");
    if (!root) return;

    const renderIcons = () => {
      for (const button of root.querySelectorAll("[data-craft], [data-neutral-toggle]")) {
        if (button.dataset.iconFallback === "true") continue;

        const craft = button.dataset.craft ?? button.dataset.craftVisual ?? "Neutral";
        const src = officialCraftIcon(craft);
        if (!src) continue;

        const existing = button.querySelector("img[data-official-class-icon]");
        if (existing?.src === src) continue;

        const image = document.createElement("img");
        image.dataset.officialClassIcon = "true";
        image.src = src;
        image.alt = "";
        image.decoding = "async";
        image.draggable = false;
        image.referrerPolicy = "no-referrer";
        image.addEventListener("error", () => {
          button.dataset.iconFallback = "true";
          button.textContent = FALLBACK_GLYPHS[craft] ?? craft.slice(0, 1);
        }, { once: true });
        button.replaceChildren(image);
      }
    };

    new MutationObserver(renderIcons).observe(root, { childList: true });
    renderIcons();
  }

  function installDeferredCardArtLoader() {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    if (!descriptor?.get || !descriptor?.set || descriptor.configurable === false) {
      installAttributeHintsOnly();
      return;
    }

    const contentRoot = document.querySelector(".db-content");
    const released = new WeakSet();
    const observer = "IntersectionObserver" in window
      ? new IntersectionObserver(entries => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            release(entry.target);
          }
        }, {
          root: contentRoot,
          rootMargin: "650px 0px",
          threshold: 0.01
        })
      : null;

    Object.defineProperty(HTMLImageElement.prototype, "src", {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get() {
        return descriptor.get.call(this);
      },
      set(value) {
        if (!isCatalogArt(this) || released.has(this) || !observer) {
          applyImageHints(this, true);
          descriptor.set.call(this, value);
          return;
        }

        applyImageHints(this, false);
        if (isNearCatalogViewport(this, contentRoot)) {
          released.add(this);
          descriptor.set.call(this, value);
          return;
        }

        this.dataset.deferredSrc = String(value);
        this.classList.add("db-art-pending");
        observer.observe(this);
      }
    });

    function release(image) {
      const src = image.dataset.deferredSrc;
      if (!src) return;
      observer?.unobserve(image);
      delete image.dataset.deferredSrc;
      image.classList.remove("db-art-pending");
      released.add(image);
      applyImageHints(image, true);
      descriptor.set.call(image, src);
    }
  }

  function installAttributeHintsOnly() {
    const root = document.getElementById("deck-results");
    if (!root) return;
    const apply = () => root.querySelectorAll("img[data-card-art]").forEach(image => applyImageHints(image, false));
    new MutationObserver(apply).observe(root, { childList: true, subtree: true });
    apply();
  }

  function isCatalogArt(image) {
    return image instanceof HTMLImageElement && image.hasAttribute("data-card-art");
  }

  function isNearCatalogViewport(image, contentRoot) {
    if (!image.isConnected) return true;
    const rect = image.getBoundingClientRect();
    const rootRect = contentRoot?.getBoundingClientRect() ?? {
      top: 0,
      bottom: window.innerHeight
    };
    return rect.bottom >= rootRect.top - 180 && rect.top <= rootRect.bottom + 650;
  }

  function applyImageHints(image, immediate) {
    if (!(image instanceof HTMLImageElement)) return;
    image.decoding = "async";
    image.loading = immediate ? "eager" : "lazy";
    if ("fetchPriority" in image) image.fetchPriority = immediate ? "auto" : "low";
  }

  function installBeyondDecksSizing() {
    const content = document.querySelector(".db-content");
    const slider = document.getElementById("deck-card-size");
    const presets = document.querySelector(".db-card-size-presets");
    if (!content || !slider || !presets) return;

    slider.min = "74";
    slider.max = "190";
    slider.step = "2";

    const fixedSizes = { S: 90, M: 118, L: 154 };
    for (const button of presets.querySelectorAll("[data-card-size-preset]")) {
      if (fixedSizes[button.textContent]) button.dataset.cardSizePreset = String(fixedSizes[button.textContent]);
    }

    if (!localStorage.getItem(CARD_SIZE_MODE_KEY)) {
      const beyondMode = localStorage.getItem(BEYOND_CARD_SIZE_MODE_KEY);
      const beyondSize = Number(localStorage.getItem(BEYOND_CARD_SIZE_KEY));
      localStorage.setItem(CARD_SIZE_MODE_KEY, beyondMode || "fit");
      if (Number.isFinite(beyondSize) && beyondSize >= 74 && beyondSize <= 190) {
        localStorage.setItem(CARD_SIZE_KEY, String(beyondSize));
      }
    }

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const updatePresetState = (value, mode) => {
      for (const button of presets.querySelectorAll("[data-card-size-preset]")) {
        const isFit = button.dataset.cardSizePreset === "fit";
        const active = isFit
          ? mode === "fit"
          : mode !== "fit" && Number(button.dataset.cardSizePreset) === Number(value);
        button.classList.toggle("active", active);
      }
    };

    const setFixed = value => {
      const size = clamp(Number(value) || 118, 74, 190);
      document.documentElement.style.setProperty("--db-card-width", `${size}px`);
      slider.value = String(size);
      localStorage.setItem(CARD_SIZE_KEY, String(size));
      localStorage.setItem(CARD_SIZE_MODE_KEY, "manual");
      updatePresetState(size, "manual");
    };

    const applyFit = () => {
      const style = getComputedStyle(content);
      const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
      const usable = Math.max(220, content.clientWidth - padding);
      const gap = 5;
      const target = 156;
      const columns = clamp(Math.round(usable / target), 2, 12);
      const fitted = clamp(Math.floor((usable - gap * (columns - 1)) / columns), 108, 190);

      document.documentElement.style.setProperty("--db-card-width", `${fitted}px`);
      slider.value = String(fitted);
      localStorage.setItem(CARD_SIZE_KEY, String(fitted));
      localStorage.setItem(CARD_SIZE_MODE_KEY, "fit");
      updatePresetState(fitted, "fit");
    };

    const applySaved = () => {
      if (localStorage.getItem(CARD_SIZE_MODE_KEY) === "fit") {
        applyFit();
        return;
      }
      setFixed(Number(localStorage.getItem(CARD_SIZE_KEY)) || 118);
    };

    document.addEventListener("click", event => {
      const button = event.target instanceof Element ? event.target.closest("[data-card-size-preset]") : null;
      if (!button || !presets.contains(button)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (button.dataset.cardSizePreset === "fit") applyFit();
      else setFixed(Number(button.dataset.cardSizePreset));
    }, true);

    slider.addEventListener("input", () => {
      const size = clamp(Number(slider.value) || 118, 74, 190);
      localStorage.setItem(CARD_SIZE_KEY, String(size));
      localStorage.setItem(CARD_SIZE_MODE_KEY, "manual");
      updatePresetState(size, "manual");
    }, true);

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(() => {
        if (localStorage.getItem(CARD_SIZE_MODE_KEY) === "fit") requestAnimationFrame(applyFit);
      });
      observer.observe(content);
    } else {
      window.addEventListener("resize", () => {
        if (localStorage.getItem(CARD_SIZE_MODE_KEY) === "fit") applyFit();
      }, { passive: true });
    }

    window.addEventListener("load", () => requestAnimationFrame(applySaved), { once: true });
  }
})();
