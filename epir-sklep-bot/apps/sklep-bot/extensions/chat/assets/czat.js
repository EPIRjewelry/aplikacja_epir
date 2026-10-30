/**
 * Day-1 widget stub. Zna tylko adres Gemmy + surface.
 * Bez tokenu admina. Pełny montaż UI = faza 2.
 */
(function () {
  var root = document.querySelector("[data-epir-czat]");
  if (!root) return;

  var surface = root.getAttribute("data-surface") || "epir";
  var gemmaUrl = (root.getAttribute("data-gemma-url") || "").trim();

  root.setAttribute("data-epir-czat-ready", "1");
  root.setAttribute("data-epir-czat-surface", surface);

  if (!gemmaUrl) {
    root.setAttribute("data-epir-czat-status", "unconfigured");
    return;
  }

  root.setAttribute("data-epir-czat-status", "idle");
  // Faza 2: WebSocket / useAgentChat → gemmaUrl. Day 1: tylko znacznik gotowości.
})();
