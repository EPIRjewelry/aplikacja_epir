/**
 * Web Pixel — day 1.
 * Subskrybuje zamkniętą listę (nie all_events — unikamy PII z przykładowego tutoriala).
 * Nazwy zdarzeń: page_viewed potwierdzone w docs; reszta listy do potwierdzenia przy scaffoldzie (NIESPRAWDZONE).
 * Zero tagu Google. Steward = faza 3; tu fetch do settings.steward_url gdy ustawiony.
 */
import { register } from "@shopify/web-pixels-extension";

register(({ analytics, settings, init, browser }) => {
  const stewardUrl = (settings && settings.steward_url) || "";

  // Lista startowa — rozszerzyć po przepisaniu z Web Pixels API standard-events.
  const EVENTS = [
    "page_viewed",
    "product_viewed",
    "collection_viewed",
    "product_added_to_cart",
    "search_submitted",
    "checkout_started",
  ];

  for (const eventName of EVENTS) {
    analytics.subscribe(eventName, async (event) => {
      if (!stewardUrl) return;

      const payload = {
        name: eventName,
        timestamp: event.timestamp || new Date().toISOString(),
        // brand wymagane w packages/event-contract (faza 3). Day 1: placeholder epir.
        brand: "epir",
        surface: "epir",
        // Bez PII: imię, mail, adres, płatność — nie wysyłamy.
      };

      try {
        await fetch(stewardUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        });
      } catch (_err) {
        // Day 1: ciche niepowodzenie; raportowanie = Steward faza 3.
      }
    });
  }

  // init / browser zarezerwowane — Customer Privacy API z piksela jest zakazane (OF).
  void init;
  void browser;
});
