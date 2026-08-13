import {escapeHtml} from './render-shared';

/** Placeholder atelier + 3D viewer — teksty/grafiki docelowe poza tym PR. */
export function renderAtelier3DPlaceholder(): string {
  return `<section id="atelier-3d" class="py-20 md:py-28 border-t border-epir-accent/10 panel-secondary reveal" aria-labelledby="atelier-heading">
    <div class="mx-auto max-w-6xl px-5 md:px-8">
      <div class="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div>
          <p class="text-epir-accent text-xs tracking-[0.25em] uppercase mb-3 font-sans">Cyfrowa pracownia</p>
          <h2 id="atelier-heading" class="font-serif text-3xl md:text-4xl text-epir-ink mb-6">Model 3D przed odlewem</h2>
          <p class="text-epir-muted text-base leading-relaxed mb-6">
            Każda forma przechodzi przez cyfrową rzeźbę — widzisz proporcje, grubość i osadzenie kamienia zanim metal trafi do ognia.
            Docelowy viewer 3D i materiały wideo pojawią się tutaj.
          </p>
          <ul class="space-y-3 text-sm text-epir-muted font-sans">
            <li class="flex items-start gap-3"><span class="text-epir-accent mt-0.5">●</span><span>Rotacja modelu i zoom detalu — placeholder interakcji</span></li>
            <li class="flex items-start gap-3"><span class="text-epir-accent mt-0.5">●</span><span>Akceptacja online przed produkcją</span></li>
            <li class="flex items-start gap-3"><span class="text-epir-accent mt-0.5">●</span><span>Ślad procesu: od szkicu do wykończenia ręcznego</span></li>
          </ul>
        </div>
        <figure class="viewer-placeholder rounded-2xl aspect-[4/3] stone-border border overflow-hidden relative" aria-label="Placeholder podglądu modelu 3D">
          <div class="absolute inset-0 viewer-grid opacity-40" aria-hidden="true"></div>
          <div class="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
            <div class="w-20 h-20 rounded-full border border-epir-accent/30 flex items-center justify-center mb-6 bg-white/70 backdrop-blur-sm">
              <svg class="w-10 h-10 text-epir-accent/60" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 48 48" aria-hidden="true">
                <path d="M8 32 L24 8 L40 32 L24 40 Z"/>
                <path d="M16 28 L24 20 L32 28"/>
              </svg>
            </div>
            <p class="font-serif text-epir-ink text-lg">Viewer 3D</p>
            <p class="text-epir-muted text-xs mt-2 tracking-[0.2em] uppercase font-sans">Placeholder — materiał wkrótce</p>
          </div>
        </figure>
      </div>
    </div>
  </section>`;
}

export function renderWarsztatPlaceholder(): string {
  return `<section id="warsztat" class="py-16 md:py-20 border-t border-epir-accent/10 reveal" aria-labelledby="warsztat-heading">
    <div class="mx-auto max-w-6xl px-5 md:px-8">
      <div class="grid md:grid-cols-3 gap-6 md:gap-8">
        <div class="md:col-span-1">
          <p class="text-epir-accent text-xs tracking-[0.25em] uppercase mb-3 font-sans">Wrocławska pracownia</p>
          <h2 id="warsztat-heading" class="font-serif text-2xl md:text-3xl text-epir-ink">Ogień, młotek, kamień</h2>
        </div>
        <div class="md:col-span-2 grid sm:grid-cols-3 gap-4">
          ${[
            {label: 'Odlew', note: 'Foto / wideo warsztatu'},
            {label: 'Oksydacja', note: 'Makro powierzchni'},
            {label: 'Kamień', note: 'Osadzenie ręczne'},
          ]
            .map(
              (item) =>
                `<figure class="workshop-tile rounded-xl aspect-[4/5] stone-border border overflow-hidden relative">
              <div class="absolute inset-0 workshop-shimmer" aria-hidden="true"></div>
              <figcaption class="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/55 to-transparent text-white text-left">
                <p class="font-serif text-sm">${escapeHtml(item.label)}</p>
                <p class="text-[0.65rem] tracking-wider uppercase opacity-80 font-sans mt-1">${escapeHtml(item.note)}</p>
              </figcaption>
            </figure>`,
            )
            .join('\n')}
        </div>
      </div>
    </div>
  </section>`;
}

/** Bridal personalization — artisan_rings only. */
export function renderEngravingHaptics(): string {
  return `<section id="grawer" class="py-16 md:py-20 border-t border-epir-accent/10 panel-cream reveal" aria-labelledby="grawer-heading">
    <div class="mx-auto max-w-3xl px-5 md:px-8 text-center">
      <p class="text-epir-accent text-xs tracking-[0.25em] uppercase mb-3 font-sans">Haptyka personalizacji</p>
      <h2 id="grawer-heading" class="font-serif text-3xl md:text-4xl text-epir-ink mb-6">Grawer zawsze gratis</h2>
      <p class="text-epir-muted text-base md:text-lg leading-relaxed mb-6">
        Indywidualny dobór kamieni i próby kruszcu (333, 585, 750). Napis, który czujesz pod palcem —
        nie naklejka marketingowa, lecz ślad Twojej historii w metalu.
      </p>
      <p class="text-sm text-epir-muted font-sans tracking-wide">
        Personalizacja UX · bez dopłaty za grawer · pracownia Wrocław
      </p>
    </div>
  </section>`;
}

/** Foundry services pricing — forest_premium only (from LP #3). */
export function renderTechnicalFoundry(): string {
  const rows = [
    {service: 'Odlew złoto (powierzone)', price: '14,5 zł/g + 3% ubytek'},
    {service: 'Odlew srebro (granulat)', price: '3,00 zł/g + 3% ubytek'},
    {service: 'Spektrometria (czystość kruszcu)', price: '30 zł'},
    {service: 'Forma gumowa (silikonowa)', price: 'od 70–80 zł'},
  ];
  return `<section id="technical-foundry" class="py-20 md:py-28 border-t border-epir-accent/10 panel-secondary reveal" aria-labelledby="foundry-heading">
    <div class="mx-auto max-w-4xl px-5 md:px-8">
      <p class="text-epir-accent text-xs tracking-[0.25em] uppercase mb-3 font-sans text-center">Transparentność kosztów</p>
      <h2 id="foundry-heading" class="font-serif text-3xl md:text-4xl text-epir-ink mb-4 text-center">Technical Foundry Section</h2>
      <p class="text-epir-muted text-base leading-relaxed mb-10 text-center max-w-2xl mx-auto">
        Precyzyjny opis i cennik rzemieślniczych odlewów wrocławskiej pracowni.
        Transparentność to nasz standard pracowni.
      </p>
      <div class="overflow-x-auto stone-border border rounded-xl bg-white/60">
        <table class="foundry-table w-full text-left text-sm font-sans">
          <thead>
            <tr class="border-b border-epir-accent/15">
              <th class="px-5 py-4 font-medium text-epir-ink tracking-wide">Usługa</th>
              <th class="px-5 py-4 font-medium text-epir-ink tracking-wide">Cena</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) =>
                  `<tr class="border-b border-epir-accent/10 last:border-0">
                <td class="px-5 py-4 text-epir-muted">${escapeHtml(r.service)}</td>
                <td class="px-5 py-4 text-epir-ink font-medium whitespace-nowrap">${escapeHtml(r.price)}</td>
              </tr>`,
              )
              .join('\n')}
          </tbody>
        </table>
      </div>
      <p class="mt-8 text-epir-muted text-sm leading-relaxed text-center max-w-2xl mx-auto">
        Standardy jakości EPIR: odlewy „czyste” — bez ogonków wlewowych, precyzyjnie igiełkowane
        i oczyszczone ultrasonicznie. Czystość odlewu, której nie widać na zdjęciu, ale którą czujesz na skórze.
      </p>
    </div>
  </section>`;
}

/** Metallurgy dichotomy table — artisan_gold only. */
export function renderTechnicalAuthorityTable(): string {
  const rows = [
    {
      param: 'Rola strategiczna',
      k14: '„Daily Warrior” — tarcza codzienności',
      k18: 'Próba 750 — ciepło, biokompatybilność, szampańskie tony',
    },
    {
      param: 'Twardość Vickersa',
      k14: '165–210 HV',
      k18: '20–30 HV (czyste), wyższa po stopowaniu',
    },
    {
      param: 'Inżynieria opraw (prongs)',
      k14: '43% większa odporność na odkształcenia',
      k18: 'Miękkość i blask — kompromis dla codziennego noszenia',
    },
    {
      param: 'Bezpieczeństwo',
      k14: 'Standardowa wytrzymałość mechaniczna',
      k18: 'Zgodność z EU Nickel Directive',
    },
    {
      param: 'Wartość melt',
      k14: '~90 $/g',
      k18: '~116 $/g (długoterminowa wartość kruszcu)',
    },
  ];
  return `<section id="technical-authority" class="py-20 md:py-28 border-t border-epir-accent/10 reveal" aria-labelledby="tech-auth-heading">
    <div class="mx-auto max-w-5xl px-5 md:px-8">
      <p class="text-epir-accent text-xs tracking-[0.25em] uppercase mb-3 font-sans text-center">Metalurgia jako tarcza codzienności</p>
      <h2 id="tech-auth-heading" class="font-serif text-3xl md:text-4xl text-epir-ink mb-4 text-center">Technical Authority</h2>
      <p class="text-epir-muted text-base leading-relaxed mb-10 text-center max-w-2xl mx-auto">
        Dychotomia kruszców: analiza ekspercka. Dane jako dowód — nie slogan.
      </p>
      <div class="overflow-x-auto stone-border border rounded-xl bg-white/70">
        <table class="tech-authority-table w-full text-left text-sm font-sans">
          <thead>
            <tr class="border-b border-epir-accent/15">
              <th class="px-4 py-4 font-medium text-epir-ink">Parametr</th>
              <th class="px-4 py-4 font-medium text-epir-ink">Złoto 14K (próba 585)</th>
              <th class="px-4 py-4 font-medium text-epir-ink">Złoto 18K (próba 750)</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) =>
                  `<tr class="border-b border-epir-accent/10 last:border-0 align-top">
                <td class="px-4 py-4 text-epir-ink font-medium whitespace-nowrap">${escapeHtml(r.param)}</td>
                <td class="px-4 py-4 text-epir-muted">${escapeHtml(r.k14)}</td>
                <td class="px-4 py-4 text-epir-muted">${escapeHtml(r.k18)}</td>
              </tr>`,
              )
              .join('\n')}
          </tbody>
        </table>
      </div>
    </div>
  </section>`;
}

/** Rich Digital Co-creation — artisan_gold (replaces generic cocreate teaser). */
export function renderDigitalCocreation(): string {
  return `<section id="wspoltworzenie" class="panel-cream py-20 md:py-28 border-t border-epir-accent/10 reveal" aria-labelledby="cocreate-heading">
    <div class="mx-auto max-w-4xl px-5 md:px-8">
      <p class="text-epir-accent text-xs tracking-[0.25em] uppercase mb-3 font-sans text-center">Digital Co-creation</p>
      <h2 id="cocreate-heading" class="font-serif text-3xl md:text-4xl text-epir-ink mb-6 text-center">Zaprojektujmy to razem online</h2>
      <p class="text-epir-muted text-base md:text-lg leading-relaxed mb-8 text-center max-w-2xl mx-auto">
        Rzeźbimy formy w wosku i w cyfrze. Nasz 3D-Agent (wtyczka AI do Blendera) to nie generator „blobów” —
        to profesjonalne narzędzie Connectioneering.
      </p>
      <ul class="space-y-4 text-sm md:text-base text-epir-muted font-sans max-w-2xl mx-auto mb-10">
        <li class="flex items-start gap-3"><span class="text-epir-accent mt-0.5">●</span><span>Czyta viewport Blendera w czasie rzeczywistym — natychmiastowa iteracja Twojego pomysłu.</span></li>
        <li class="flex items-start gap-3"><span class="text-epir-accent mt-0.5">●</span><span>Generuje Clean Quad Topology — czystą geometrię gotową do druku 3D, bez typowych błędów AI.</span></li>
        <li class="flex items-start gap-3"><span class="text-epir-accent mt-0.5">●</span><span>Opisz wizję prostym językiem: „Dodaj teksturę młotkowaną do szerszej obrączki i osadź tanzanit w koronie z gałązek”.</span></li>
      </ul>
      <p class="text-epir-muted text-sm leading-relaxed mb-8 text-center max-w-xl mx-auto">
        Zobacz, jak pomysł materializuje się w 3D przed uderzeniem pierwszego młotka.
        Sesja z projektantem i agentem AI to pierwszy krok do Twojego unikatowego symbolu.
      </p>
      <div class="text-center">
        <a href="https://epirbizuteria.pl/pages/zaprojektuj-swoj-model" class="btn-cta inline-flex items-center justify-center px-8 py-3.5 rounded-full font-semibold text-sm tracking-wide text-epir-on">
          Rozpocznij projektowanie online
        </a>
      </div>
    </div>
  </section>`;
}

export function renderMotionScript(): string {
  return `<script>
    (function () {
      var nodes = document.querySelectorAll('.reveal');
      if (!nodes.length || !('IntersectionObserver' in window)) return;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-visible');
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
      nodes.forEach(function (n) { io.observe(n); });
    })();
  </script>`;
}

const ADS_LANDING_HOST = 'https://l.epirbizuteria.pl';

/** Soft whisper bridge — only on artisan_gold, before footer. */
export function renderKazkaBridge(): string {
  const href =
    'https://kazka.epirbizuteria.pl/?utm_source=epir_landing&utm_medium=bridge&utm_campaign=artisan_gold_to_kazka';
  return `<section id="most-kazka" class="kazka-bridge kazka-bridge--whisper reveal" aria-labelledby="kazka-bridge-heading">
    <div class="mx-auto max-w-2xl px-5 md:px-8 py-12 md:py-14 text-center">
      <p class="text-[0.65rem] tracking-[0.28em] uppercase mb-3 font-sans text-epir-ink/50">Szept · osobna pracownia Wrocław</p>
      <h2 id="kazka-bridge-heading" class="font-serif text-lg md:text-xl text-epir-ink mb-3 font-normal">
        Szukasz klasyki połączonej z nowoczesnością — złoto i brylanty?
      </h2>
      <p class="text-epir-muted text-sm leading-relaxed mb-6 max-w-md mx-auto">
        <a href="${escapeHtml(href)}" class="kazka-whisper-link underline-offset-4 hover:underline" rel="noopener noreferrer">
          Kazka Jewelry
        </a>
        — bez mieszania katalogu EPIR.
      </p>
    </div>
  </section>`;
}

export type SilverCrossKind = 'rings_to_silver' | 'silver_to_rings';

/** Navigation between silver landings — not A/B. */
export function renderSilverCrossBridge(kind: SilverCrossKind): string {
  if (kind === 'rings_to_silver') {
    const href = `${ADS_LANDING_HOST}/?utm_campaign=forest_premium&utm_source=epir_landing&utm_medium=bridge`;
    return `<section class="silver-cross-bridge py-14 md:py-16 panel-secondary reveal" aria-labelledby="silver-cross-heading">
      <div class="mx-auto max-w-3xl px-5 md:px-8 text-center">
        <h2 id="silver-cross-heading" class="font-serif text-2xl md:text-3xl text-epir-ink mb-4">
          Szukasz kolczyków lub bransolety w tym samym języku formy?
        </h2>
        <p class="text-epir-muted text-sm md:text-base leading-relaxed mb-6">
          Odkryj kolekcję leśną — reszta srebra z pracowni, poza pierścionkami.
        </p>
        <a href="${escapeHtml(href)}" class="btn-outline inline-flex items-center justify-center px-8 py-3.5 rounded-full font-medium text-sm tracking-wide">
          Kolekcja leśna
        </a>
      </div>
    </section>`;
  }

  const href = `${ADS_LANDING_HOST}/?utm_campaign=artisan_rings&utm_source=epir_landing&utm_medium=bridge`;
  return `<section class="silver-cross-bridge py-14 md:py-16 panel-secondary reveal" aria-labelledby="silver-cross-heading">
    <div class="mx-auto max-w-3xl px-5 md:px-8 text-center">
      <h2 id="silver-cross-heading" class="font-serif text-2xl md:text-3xl text-epir-ink mb-4">
        Szukasz pierścionka zaręczynowego lub obrączki?
      </h2>
      <p class="text-epir-muted text-sm md:text-base leading-relaxed mb-6">
        Przejdź do pracowni pierścieni — osobna ścieżka intencji.
      </p>
      <a href="${escapeHtml(href)}" class="btn-outline inline-flex items-center justify-center px-8 py-3.5 rounded-full font-medium text-sm tracking-wide">
        Pracownia pierścieni
      </a>
    </div>
  </section>`;
}
