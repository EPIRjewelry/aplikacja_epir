/** Minimalny worker — tylko binding D1 dla testów pool-workers (E0). */
export default {
  fetch() {
    return new Response('ok');
  },
};
