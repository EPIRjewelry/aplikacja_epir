/**
 * Design-shout bridge Kazka → EPIR (organic gold / precious stones).
 * Genialny plan: loud visual, one CTA, no product grid, above footer.
 * Intent: push toward organic noble forms in gold — not a cheaper silver side path.
 */
export function OrganicEpirBridge() {
  const href =
    'https://epirbizuteria.pl/collections/bizuteria-zlota?utm_source=kazka&utm_medium=bridge&utm_campaign=kazka_to_epir_organic';

  return (
    <section
      aria-labelledby="organic-epir-bridge-heading"
      className="relative w-full overflow-hidden bg-[rgb(var(--color-primary))] text-[rgb(var(--color-contrast))]"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        aria-hidden="true"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='t'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.4' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23t)'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="relative mx-auto flex max-w-5xl flex-col items-center px-6 py-16 text-center md:px-10 md:py-24">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.35em] text-[rgb(var(--color-accent))]">
          Inny język formy
        </p>
        <h2
          id="organic-epir-bridge-heading"
          className="max-w-3xl font-serif text-3xl leading-tight md:text-5xl md:leading-[1.1]"
        >
          Szukasz organicznej rzeźby w złocie?
        </h2>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-[rgb(var(--color-contrast))]/85 md:text-lg">
          EPIR Art Jewellery — złoto o żywej powierzchni i formie inspirowanej lasem:
          brylant oraz inne kamienie szlachetne w rzeźbiarskim osadzeniu. Także srebro
          w tym samym, równie szlachetnym języku. Osobna pracownia, ta sama wrocławska
          dyscyplina rzemiosła.
        </p>
        <a
          href={href}
          rel="noopener noreferrer"
          className="mt-10 inline-flex items-center justify-center border-2 border-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent))] px-10 py-4 text-xs font-bold uppercase tracking-[0.22em] text-[rgb(var(--color-primary))] transition-opacity hover:opacity-90"
        >
          Odkryj złoto EPIR
        </a>
      </div>
    </section>
  );
}
