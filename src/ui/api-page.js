document.querySelectorAll("[data-copy-endpoint]").forEach(button => {
  button.addEventListener("click", async () => {
    const selector = button.dataset.copyEndpoint;
    const link = selector ? document.querySelector(selector) : null;
    if (!(link instanceof HTMLAnchorElement)) return;

    try {
      await navigator.clipboard.writeText(link.href);
      button.dataset.copied = "true";
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.dataset.copied = "false";
        button.textContent = "Copy";
      }, 1200);
    } catch {
      window.prompt("Copy endpoint", link.href);
    }
  });
});
