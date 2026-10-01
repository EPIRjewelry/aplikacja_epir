/**
 * Wklejka do Shopify Admin → Settings → Customer events → custom pixel
 * „EPIR Art Jewellery Pixel” (id 272171340). Nie deployuje się z `shopify app deploy`.
 *
 * Live do 2026-10-01 wysyłał tylko event.data i gubił event.clientId → NULL session_id.
 * Kontrakt: extensions/my-web-pixel/src/custom-pixel-payload.ts
 */
analytics.subscribe('all_standard_events', function (event) {
  var sessionId = event && typeof event.clientId === 'string' ? event.clientId.trim() : '';
  var commerce = event && event.data && typeof event.data === 'object' ? event.data : {};
  var data = {};
  var key;
  for (key in commerce) {
    if (Object.prototype.hasOwnProperty.call(commerce, key)) data[key] = commerce[key];
  }
  data.clientId = sessionId;
  data.sessionId = sessionId;
  data.session_id = sessionId;
  if (event && event.context) data.context = event.context;
  fetch('https://asystent.epirbizuteria.pl/pixel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: event && event.name,
      data: data,
    }),
  });
});
