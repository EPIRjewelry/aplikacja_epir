/** Editorial manifesto bridge — smooth transition between category tiles and video. */
export function KazkaEditorialManifestoBridge() {
  return (
    <section
      aria-labelledby="kazka-manifesto-heading"
      className="w-full border-y border-[rgb(var(--color-accent)/0.35)] bg-gradient-to-b from-[#f2f2f2] to-[#f4efe8] py-10 md:py-14"
    >
      <div className="mx-auto flex max-w-4xl flex-col items-center px-6 text-center md:px-10">
        <p className="kazka-editorial-label mb-5 text-[10px] tracking-[0.28em] text-[rgb(var(--color-primary))]/70">
          KAZKA
        </p>
        <blockquote
          id="kazka-manifesto-heading"
          className="font-serif text-2xl italic leading-snug text-[rgb(var(--color-primary))] md:text-4xl md:leading-tight"
        >
          Diament w złocie — precyzja, którą czujesz na skórze.
        </blockquote>
        <p className="kazka-editorial-label mt-6 text-[10px] tracking-[0.22em] text-[rgb(var(--color-primary))]/60">
          ZŁOTO 18K · BRYLANTY · PRACOWNIA WROCŁAW
        </p>
      </div>
    </section>
  );
}
