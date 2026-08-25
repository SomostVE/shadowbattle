(() => {
  const PORTAL_CLASS_ASSET = "https://shadowverse-portal.com/public/assets/image/cards/en/classes";
  const CRAFT_CLASS_IDS = Object.freeze({
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
    Forestcraft: "F",
    Swordcraft: "S",
    Runecraft: "R",
    Dragoncraft: "D",
    Shadowcraft: "Sh",
    Bloodcraft: "B",
    Havencraft: "H",
    Portalcraft: "P"
  });

  upgradeOfficialCraftButtons();
  installDeferredCardArtLoader();

  function officialCraftIcon(craft) {
    const classId = CRAFT_CLASS_IDS[craft];
    return classId ? `${PORTAL_CLASS_ASSET}/${classId}/class_checkbox.png` : null;
  }

  function upgradeOfficialCraftButtons() {
    const root = document.getElementById("deck-craft-buttons");
    if (!root) return;

    const renderIcons = () => {
      for (const button of root.querySelectorAll("[data-craft]")) {
        const craft = button.dataset.craft;
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
          button.textContent = FALLBACK_GLYPHS[craft] ?? craft.slice(0, 1);
          button.dataset.iconFallback = "true";
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
})();
