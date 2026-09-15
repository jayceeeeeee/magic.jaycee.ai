(function () {
  const status = document.querySelector("[data-level-status]");
  const cells = Array.from(document.querySelectorAll("[data-cell-action]"));

  function init() {
    if (status) {
      status.textContent = "Open grid";
    }

    cells.forEach((cell) => {
      const title = cell.querySelector(".level-cell-title")?.textContent || "Square";

      cell.setAttribute("aria-label", title);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
