import type {CampaignLandingData} from './campaign';
import type {Env} from './env';
import {
  absoluteStoreUrl,
  escapeHtml,
  renderEditorialHead,
  renderFooter,
  renderMobileMenuScript,
  renderNav,
  renderProductStrip,
  storeOrigin,
  type ProductNode,
} from './render-shared';

export const ORGANIC_ART_HANDLE = 'organic-art-landing';

const ORGANIC_THEME = {
  heroMode: 'light' as const,
};

/** Full editorial landing for organic_art (Strona 1) on l.epirbizuteria.pl */
export function renderOrganicArtLandingHtml(
  env: Env,
  campaign: CampaignLandingData,
  products: ProductNode[],
): string {
  const store = storeOrigin(env);
  const collectionUrl = absoluteStoreUrl(
    env,
    campaign.ctaUrl || '/collections/kolekcja-galazki',
  );
  const heroTitle = campaign.heroTitle || 'Biżuteria artystyczna';
  const productStrip = renderProductStrip({
    env,
    products,
    productIds: campaign.productIds,
    heading: 'Kolekcja Gałązki',
    eyebrow: 'Wybrane z pracowni',
    moreHref: collectionUrl,
    moreLabel: 'Zobacz więcej',
  });

  return `<!DOCTYPE html>
<html lang="pl" class="scroll-smooth">
<head>
  ${renderEditorialHead({
    title: `${heroTitle} — EPIR Art Jewellery`,
    description:
      'Biżuteria, która ma teksturę, a nie filtry. Ręcznie kute formy inspirowane surowym pięknem dolnośląskich lasów — wrocławska pracownia EPIR.',
    canonical: `${store}/`,
    theme: ORGANIC_THEME,
  })}
</head>
<body class="font-sans text-epir-ink antialiased">
  ${renderNav(store, {variant: 'organic'})}

  <main>
    <section class="pt-24 md:pt-32 pb-16 md:pb-24 hero-light" aria-labelledby="hero-heading">
      <div class="mx-auto max-w-6xl px-5 md:px-8">
        <p class="text-epir-accent text-xs tracking-[0.3em] uppercase mb-4 font-sans">Rzeźbione ogniem, inspirowane chaosem natury</p>
        <div class="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          <div>
            <h1 id="hero-heading" class="font-serif text-4xl md:text-5xl lg:text-[3.25rem] leading-[1.12] text-epir-ink mb-6" data-dynamic-hero-title>
              Biżuteria, która ma teksturę, a&nbsp;nie filtry.
            </h1>
            <p class="text-epir-muted text-base md:text-lg leading-relaxed mb-8 max-w-lg" data-dynamic-hero-subtitle>
              Odrzucamy fabryczną powtarzalność. Odkryj rzeźbiarskie formy inspirowane surowym pięknem dolnośląskich lasów, kute ręcznie we wrocławskiej pracowni.
            </p>
            <div class="flex flex-col sm:flex-row gap-4">
              <a href="${escapeHtml(collectionUrl)}" class="btn-cta inline-flex items-center justify-center px-8 py-3.5 rounded-full font-semibold text-sm tracking-wide text-epir-on" data-dynamic-cta>
                Odkryj Kolekcję Gałązki
              </a>
              <a href="#wspoltworzenie" class="btn-outline inline-flex items-center justify-center px-8 py-3.5 rounded-full font-medium text-sm tracking-wide">
                Zaprojektuj z nami online
              </a>
            </div>
          </div>
          <figure class="hero-visual-light relative rounded-2xl overflow-hidden aspect-[4/5] md:aspect-square stone-ring" aria-label="Makro zbliżenie pierścionka Gałązki na wilgotnej korze drzewa — surowa tekstura i polerowane srebro">
            <div class="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
              <div class="w-32 h-32 md:w-40 md:h-40 rounded-full stone-border border flex items-center justify-center mb-6 bg-white/60">
                <svg class="w-16 h-16 text-epir-accent/50" fill="none" stroke="currentColor" stroke-width="0.75" viewBox="0 0 64 64" aria-hidden="true">
                  <path d="M32 8 C20 20, 12 32, 16 48 C20 56, 44 56, 48 44 C52 32, 44 16, 32 8 Z"/>
                  <path d="M28 24 C32 20, 38 22, 40 28"/>
                </svg>
              </div>
              <p class="font-serif text-epir-muted text-sm italic">Makro — pierścień Gałązki na korze</p>
              <p class="text-epir-muted/70 text-xs mt-2 font-sans tracking-wider uppercase">Ujęcie produktowe — wkrótce</p>
            </div>
          </figure>
        </div>
      </div>
    </section>

    <section id="pracownia" class="panel-cream py-20 md:py-28 border-y border-epir-accent/10" aria-labelledby="manifesto-heading">
      <div class="mx-auto max-w-4xl px-5 md:px-8 text-center">
        <p class="text-epir-accent text-xs tracking-[0.25em] uppercase mb-3 font-sans">Niedoskonały z Założenia</p>
        <h2 id="manifesto-heading" class="font-serif text-3xl md:text-4xl text-epir-ink mb-8 italic">Imperfect by Design</h2>
        <div class="space-y-6 text-epir-muted text-base md:text-lg leading-relaxed text-left md:text-center">
          <p>
            W świecie biżuterii masowej każdy element jest identyczny — wypolerowany do lustrzanego połysku, pozbawiony śladów narzędzi. My idziemy w przeciwnym kierunku.
          </p>
          <p>
            Organiczne pęknięcia, asymetryczne skręty gałęzi, pory surowego metalu — to nie wady produkcyjne. To świadome ślady ludzkich dłoni i ognia warsztatowego. Każdy egzemplarz nosi historię procesu, w którym materiał współpracuje z rzemieślnikiem, a nie jest tylko poddany maszynie.
          </p>
        </div>
        <blockquote class="quote-block mt-12 px-6 py-8 md:px-10 text-left md:text-center rounded-r-lg">
          <p class="font-serif text-xl md:text-2xl text-epir-ink leading-snug italic">
            „Prawdziwy luksus rodzi się w błędzie i unikalności, nie w seryjnym szablonie."
          </p>
        </blockquote>
      </div>
    </section>

    <section class="py-20 md:py-28 panel-secondary" aria-labelledby="featured-heading">
      <div class="mx-auto max-w-6xl px-5 md:px-8">
        <div class="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
          <figure class="product-frame rounded-2xl aspect-square flex items-center justify-center stone-border border overflow-hidden" aria-label="Pierścień Gałązki z czarnym turmalinem — render produktowy">
            <div class="text-center p-8">
              <svg class="w-24 h-24 mx-auto text-epir-accent/40 mb-4" fill="none" stroke="currentColor" stroke-width="0.75" viewBox="0 0 80 80" aria-hidden="true">
                <ellipse cx="40" cy="44" rx="28" ry="24"/>
                <path d="M40 20 C34 28, 30 36, 32 44 C34 50, 46 50, 48 44 C50 36, 46 28, 40 20 Z"/>
                <circle cx="40" cy="36" r="6" fill="currentColor" opacity="0.4"/>
              </svg>
              <p class="font-serif text-epir-muted text-sm">Pierścień „Gałązki"</p>
            </div>
          </figure>
          <div>
            <p class="text-epir-accent text-xs tracking-[0.25em] uppercase mb-3 font-sans">Flagowy model</p>
            <h2 id="featured-heading" class="font-serif text-3xl md:text-4xl text-epir-ink mb-6">Pierścień „Gałązki" z Czarnym Turmalinem</h2>
            <div class="space-y-4 text-epir-muted leading-relaxed">
              <p>
                Surowy, nieokiełznany czarny turmalin — jak węgielny fragment nocnego lasu — osadzony w ręcznie formowanych, gałązkowatych szponach ze srebra próby 925. Metal nie udaje gładkości; zachowuje ślady młotka i selektywnej oksydacji, które podkreślają rzeźbiarski charakter formy.
              </p>
              <p>
                Dotykając go, czujesz chłód kamienia i ciepło metalu jednocześnie — dwa światy: mineralny i organiczny, połączone ogniem lutowniczym w jednej, niepowtarzalnej kompozycji.
              </p>
            </div>
            <div class="mt-8 inline-flex items-start gap-3 px-4 py-3 rounded-lg stone-border border bg-epir-field">
              <svg class="w-5 h-5 text-epir-accent shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              <p class="text-xs text-epir-muted leading-relaxed">
                <span class="text-epir-accent font-medium">Technical Authority:</span> Srebro próby 925, poddane selektywnej, głębokiej oksydacji i ręcznemu polerowaniu.
              </p>
            </div>
            <a href="${escapeHtml(collectionUrl)}" class="btn-cta inline-flex mt-8 px-8 py-3.5 rounded-full font-semibold text-sm tracking-wide text-epir-on">
              Zobacz Kolekcję Gałązki
            </a>
          </div>
        </div>
      </div>
    </section>

    ${productStrip}

    <section id="wspoltworzenie" class="panel-cream py-20 md:py-28 border-t border-epir-accent/10" aria-labelledby="cocreate-heading">
      <div class="mx-auto max-w-6xl px-5 md:px-8">
        <div class="text-center mb-14 md:mb-20">
          <p class="text-epir-accent text-xs tracking-[0.25em] uppercase mb-3 font-sans">Twój pomysł. Nasz ogień. Stwórzmy coś, co nie istnieje.</p>
          <h2 id="cocreate-heading" class="font-serif text-3xl md:text-4xl text-epir-ink max-w-2xl mx-auto">
            Nie znalazłeś swojego ideału? Zaprojektujmy go razem online.
          </h2>
        </div>

        <ol class="grid md:grid-cols-3 gap-8 md:gap-6 mb-16 md:mb-20 list-none p-0 m-0">
          <li class="text-center md:text-left">
            <svg class="step-icon w-12 h-12 mx-auto md:mx-0 mb-4" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true">
              <path d="M8 36 L8 12 L28 8 L40 16 L40 40 L20 44 Z"/>
              <path d="M14 28 L22 20 L30 26 L36 18"/>
            </svg>
            <h3 class="font-serif text-lg text-epir-ink mb-2">1. Twój Krok: Szkic lub Myśl</h3>
            <p class="text-epir-muted text-sm leading-relaxed">Prześlij surowy szkic, zdjęcie kory z wyprawy albo opisz swoją wizję słowami.</p>
          </li>
          <li class="text-center md:text-left">
            <svg class="step-icon w-12 h-12 mx-auto md:mx-0 mb-4" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true">
              <path d="M12 36 L12 16 L24 10 L36 16 L36 36 L24 42 Z"/>
              <path d="M18 24 L24 18 L30 24 L24 30 Z"/>
              <circle cx="24" cy="24" r="3" fill="currentColor"/>
            </svg>
            <h3 class="font-serif text-lg text-epir-ink mb-2">2. Nasz Krok: Rzeźba 3D</h3>
            <p class="text-epir-muted text-sm leading-relaxed">Tłumaczymy wizję na cyfrowy model 3D. Przeglądasz i korygujesz go na ekranie telefonu.</p>
          </li>
          <li class="text-center md:text-left">
            <svg class="step-icon w-12 h-12 mx-auto md:mx-0 mb-4" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true">
              <path d="M16 38 C16 38, 12 28, 16 20 C20 12, 28 10, 32 14 C36 18, 34 30, 28 36 C22 42, 16 38, 16 38 Z"/>
              <path d="M22 22 L26 18 L30 22"/>
            </svg>
            <h3 class="font-serif text-lg text-epir-ink mb-2">3. Wspólny Finał: Trwały Odlew</h3>
            <p class="text-epir-muted text-sm leading-relaxed">Po Twojej akceptacji odlewamy i ręcznie wykańczamy w srebrze lub złocie we wrocławskiej pracowni.</p>
          </li>
        </ol>

        <div id="cocreate-form-wrap" class="max-w-2xl mx-auto">
          <form id="cocreate-form" class="space-y-6" novalidate>
            <div id="upload-zone" class="upload-zone rounded-xl p-8 md:p-10 text-center cursor-pointer" role="button" tabindex="0" aria-label="Strefa przesyłania pliku">
              <input type="file" id="file-input" accept="image/png,image/jpeg,image/jpg" class="sr-only" />
              <svg class="w-10 h-10 text-epir-accent/60 mx-auto mb-4" fill="none" stroke="currentColor" stroke-width="1.25" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"/></svg>
              <p class="text-epir-ink text-sm mb-1">Upuść swój szkic lub zdjęcie inspiracji tutaj</p>
              <p class="text-epir-muted text-xs">PNG, JPG — max 10 MB</p>
              <p id="file-name" class="text-epir-accent text-sm mt-3 hidden"></p>
            </div>

            <div>
              <label for="name" class="block text-xs tracking-widest uppercase text-epir-accent mb-2">Imię</label>
              <input type="text" id="name" name="name" required autocomplete="given-name" class="field-input w-full rounded-lg px-4 py-3 placeholder:text-epir-muted/50 transition-colors" placeholder="Twoje imię" />
            </div>
            <div>
              <label for="email" class="block text-xs tracking-widest uppercase text-epir-accent mb-2">E-mail</label>
              <input type="email" id="email" name="email" required autocomplete="email" class="field-input w-full rounded-lg px-4 py-3 placeholder:text-epir-muted/50 transition-colors" placeholder="twoj@email.pl" />
            </div>
            <div>
              <label for="vision" class="block text-xs tracking-widest uppercase text-epir-accent mb-2">Opis Twojej Wizji</label>
              <textarea id="vision" name="vision" required rows="4" class="field-input w-full rounded-lg px-4 py-3 placeholder:text-epir-muted/50 transition-colors resize-y" placeholder="Opisz formę, kamień, okazję — im więcej detali, tym lepiej."></textarea>
            </div>
            <p id="form-error" class="text-red-600 text-sm hidden" role="alert"></p>
            <button type="submit" class="btn-cta w-full md:w-auto px-10 py-4 rounded-full font-semibold text-sm tracking-widest uppercase text-epir-on">
              Rozpocznij projektowanie online
            </button>
          </form>

          <div id="success-panel" class="success-panel hidden text-center py-12" role="status">
            <svg class="w-16 h-16 text-epir-accent mx-auto mb-6" fill="none" stroke="currentColor" stroke-width="1.25" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <h3 class="font-serif text-2xl text-epir-ink mb-3">Dziękujemy — Twoja wizja dotarła do pracowni</h3>
            <p class="text-epir-muted text-sm max-w-md mx-auto leading-relaxed">
              Nasz złotnik przejrzy przesłane materiały i odezwie się w ciągu 2–3 dni roboczych, aby omówić kolejne kroki współtworzenia.
            </p>
          </div>
        </div>
      </div>
    </section>
  </main>

  ${renderFooter(store)}

  <script>
    (function () {
      var uploadZone = document.getElementById('upload-zone');
      var fileInput = document.getElementById('file-input');
      var fileName = document.getElementById('file-name');
      var form = document.getElementById('cocreate-form');
      var successPanel = document.getElementById('success-panel');
      var formError = document.getElementById('form-error');
      var selectedFile = null;
      var MAX_BYTES = 10 * 1024 * 1024;

      function validateFile(file) {
        if (!file) return true;
        var okType = /^image\\/(png|jpeg|jpg)$/i.test(file.type) || /\\.(png|jpe?g)$/i.test(file.name);
        if (!okType) return 'Dozwolone formaty: PNG, JPG.';
        if (file.size > MAX_BYTES) return 'Plik jest za duży (max 10 MB).';
        return null;
      }

      function setFile(file) {
        var err = validateFile(file);
        if (err) {
          formError.textContent = err;
          formError.classList.remove('hidden');
          selectedFile = null;
          fileName.classList.add('hidden');
          return;
        }
        formError.classList.add('hidden');
        selectedFile = file;
        if (file) {
          fileName.textContent = file.name;
          fileName.classList.remove('hidden');
        } else {
          fileName.classList.add('hidden');
        }
      }

      if (uploadZone && fileInput) {
        uploadZone.addEventListener('click', function () { fileInput.click(); });
        uploadZone.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
        });
        fileInput.addEventListener('change', function () {
          setFile(fileInput.files && fileInput.files[0] ? fileInput.files[0] : null);
        });
        ['dragenter', 'dragover'].forEach(function (ev) {
          uploadZone.addEventListener(ev, function (e) {
            e.preventDefault();
            uploadZone.classList.add('drag-over');
          });
        });
        ['dragleave', 'drop'].forEach(function (ev) {
          uploadZone.addEventListener(ev, function (e) {
            e.preventDefault();
            uploadZone.classList.remove('drag-over');
          });
        });
        uploadZone.addEventListener('drop', function (e) {
          var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
          if (file) setFile(file);
        });
      }

      if (form) {
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          formError.classList.add('hidden');
          var name = document.getElementById('name').value.trim();
          var email = document.getElementById('email').value.trim();
          var vision = document.getElementById('vision').value.trim();
          if (!name || !email || !vision) {
            formError.textContent = 'Uzupełnij imię, e-mail i opis wizji.';
            formError.classList.remove('hidden');
            return;
          }
          if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
            formError.textContent = 'Podaj poprawny adres e-mail.';
            formError.classList.remove('hidden');
            return;
          }
          if (selectedFile) {
            var fileErr = validateFile(selectedFile);
            if (fileErr) {
              formError.textContent = fileErr;
              formError.classList.remove('hidden');
              return;
            }
          }
          form.classList.add('hidden');
          successPanel.classList.remove('hidden');
        });
      }
    })();
  </script>
  ${renderMobileMenuScript()}
</body>
</html>`;
}
