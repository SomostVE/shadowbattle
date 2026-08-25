document.querySelectorAll("[data-copy-endpoint]").forEach(button => {
  button.addEventListener("click", async () => {
    const selector = button.dataset.copyEndpoint;
    const link = selector ? document.querySelector(selector) : null;
    if (!(link instanceof HTMLAnchorElement)) return;
    await copyValue(button, link.href);
  });
});

document.querySelectorAll("[data-copy-text]").forEach(button => {
  button.addEventListener("click", async () => {
    const selector = button.dataset.copyText;
    const target = selector ? document.querySelector(selector) : null;
    const value = target?.textContent?.trim();
    if (!value) return;
    await copyValue(button, value);
  });
});

async function copyValue(button, value) {
  const initial = button.textContent;
  try {
    await navigator.clipboard.writeText(value);
    button.dataset.copied = "true";
    button.textContent = "Copied";
    window.setTimeout(() => {
      button.dataset.copied = "false";
      button.textContent = initial;
    }, 1200);
  } catch {
    window.prompt("Copy", value);
  }
}
