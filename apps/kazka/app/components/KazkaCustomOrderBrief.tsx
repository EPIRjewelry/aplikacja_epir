import {useFetcher} from '@remix-run/react';
import {useCallback, useRef, useState} from 'react';

type CustomOrderActionData = {
  ok: boolean;
  referenceId?: string;
  message?: string;
  error?: string;
};

const MAX_BYTES = 10 * 1024 * 1024;

const NOISE_TEXTURE = `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='t'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.4' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23t)'/%3E%3C/svg%3E")`;

function validateFile(file: File | null): string | null {
  if (!file) return null;
  const okType =
    /^image\/(png|jpeg|jpg)$/i.test(file.type) ||
    /\.(png|jpe?g)$/i.test(file.name);
  if (!okType) return 'Dozwolone formaty: PNG, JPG.';
  if (file.size > MAX_BYTES) return 'Plik jest za duży (max 10 MB).';
  return null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

const fieldClass =
  'w-full rounded-sm border border-white/15 bg-white/10 px-4 py-3.5 text-[0.95rem] text-[rgb(var(--color-contrast))] placeholder:text-[rgb(var(--color-contrast))]/40 focus:outline focus:outline-2 focus:outline-[rgb(var(--color-accent))]/50';

/** Ciemne tło + color-scheme — natywne dropdowny czytelne na Windows/macOS/mobile. */
const selectClass =
  'w-full rounded-sm border border-white/15 bg-[#18181b] px-4 py-3.5 text-[0.95rem] text-white focus:outline focus:outline-2 focus:outline-[rgb(var(--color-accent))]/50';

const selectProps = {style: {colorScheme: 'dark' as const}};

const labelClass =
  'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[rgb(var(--color-accent))]';

const STONE_OPTIONS = [
  {value: 'brylant biały', label: 'Brylant biały'},
  {value: 'brylant czarny', label: 'Brylant czarny (Fancy Black)'},
  {value: 'morganit', label: 'Morganit'},
  {value: 'turmalin', label: 'Turmalin'},
  {value: 'salt & pepper', label: 'Salt & Pepper'},
  {value: 'szmaragd', label: 'Szmaragd'},
  {value: 'szafir', label: 'Szafir'},
  {value: 'bez kamienia', label: 'Bez kamienia'},
  {value: 'inne kamienie szlachetne', label: 'Inne kamienie szlachetne'},
  {value: 'omówię z złotnikiem', label: 'Omówię z złotnikiem'},
] as const;

const METAL_OPTIONS = [
  {value: 'złoto 18k białe', label: 'Złoto 18k białe'},
  {value: 'złoto 18k żółte', label: 'Złoto 18k żółte'},
  {value: 'złoto 18k różowe', label: 'Złoto 18k różowe'},
  {value: 'inne', label: 'Inne'},
  {value: 'omówię', label: 'Omówię'},
] as const;

const BUDGET_OPTIONS = [
  {value: 'do 10k', label: 'Do 10 000 zł'},
  {value: '10-30k', label: '10 000 – 30 000 zł'},
  {value: '30k+', label: 'Powyżej 30 000 zł'},
  {value: 'omówię', label: 'Omówię'},
] as const;

function visionPlaceholderForSelections(
  jewelryType: string,
  stone: string,
  metal: string,
): string {
  const needsDetail =
    jewelryType === 'inne' ||
    stone === 'inne kamienie szlachetne' ||
    metal === 'inne';
  if (needsDetail) {
    return 'Opisz formę, geometrię i okazję — jeśli wybrałeś/aś „Inne”, doprecyzuj materiał lub kamień.';
  }
  return 'Opisz formę, geometrię, okazję — im więcej detali, tym lepiej.';
}

/** Brief zamówienia indywidualnego — bezpośrednio pod filmem editorial na homepage Kazka. */
export function KazkaCustomOrderBrief() {
  const fetcher = useFetcher<CustomOrderActionData>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [jewelryType, setJewelryType] = useState('pierścionek zaręczynowy');
  const [stone, setStone] = useState('');
  const [metal, setMetal] = useState('');
  const visionPlaceholder = visionPlaceholderForSelections(
    jewelryType,
    stone,
    metal,
  );

  const isSubmitting = fetcher.state !== 'idle';
  const isSuccess = fetcher.data?.ok === true;
  const serverError = fetcher.data?.ok === false ? fetcher.data.error : null;
  const displayError = clientError ?? serverError;

  const applyFile = useCallback((file: File | null) => {
    const err = validateFile(file);
    if (err) {
      setClientError(err);
      setSelectedFile(null);
      return;
    }
    setClientError(null);
    setSelectedFile(file);
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClientError(null);

    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const consent = form.elements.namedItem('consent_project');
    if (
      consent instanceof HTMLInputElement &&
      consent.type === 'checkbox' &&
      !consent.checked
    ) {
      setClientError('Wymagana zgoda na kontakt w sprawie projektu.');
      return;
    }

    if (selectedFile) {
      const fileErr = validateFile(selectedFile);
      if (fileErr) {
        setClientError(fileErr);
        return;
      }
    }

    const formData = new FormData(form);
    formData.set('source_url', window.location.href);
    formData.delete('attachment');

    if (selectedFile) {
      try {
        const base64 = await fileToBase64(selectedFile);
        formData.set('attachment_base64', base64);
        formData.set('attachment_filename', selectedFile.name || 'upload.jpg');
      } catch {
        setClientError('Nie udało się odczytać pliku. Spróbuj ponownie.');
        return;
      }
    }

    fetcher.submit(formData, {
      method: 'post',
      action: '/api/custom-order',
      encType: 'multipart/form-data',
    });
  };

  return (
    <section
      id="kazka-custom-order"
      aria-labelledby="kazka-custom-order-heading"
      className="relative w-full overflow-hidden bg-[rgb(var(--color-primary))] text-[rgb(var(--color-contrast))]"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        aria-hidden="true"
        style={{backgroundImage: NOISE_TEXTURE}}
      />

      <div className="relative mx-auto max-w-2xl px-6 py-16 md:px-10 md:py-24">
        <div className="mb-10 text-center md:mb-12">
          <p className="kazka-editorial-label mb-4 text-[10px] tracking-[0.28em] text-[rgb(var(--color-accent))]">
            KAZKA · ZAMÓWIENIE INDYWIDUALNE
          </p>
          <h2
            id="kazka-custom-order-heading"
            className="font-serif text-3xl leading-tight md:text-4xl md:leading-[1.15]"
          >
            Jeden projekt. Jeden pierścionek.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[rgb(var(--color-contrast))]/85 md:text-lg">
            Każde zamówienie zaczyna się od rozmowy. Opisz kształt, kamień i
            okazję — zaprojektujemy geometrię pod Twój palec.
          </p>
        </div>

        {isSuccess ? (
          <div className="py-8 text-center" role="status">
            <svg
              className="mx-auto mb-5 h-14 w-14 text-[rgb(var(--color-accent))]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="font-serif text-2xl">Dziękujemy — Twoja wizja dotarła do pracowni</h3>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[rgb(var(--color-contrast))]/80 md:text-base">
              {fetcher.data?.message ??
                'Nasz złotnik przejrzy przesłane materiały i odezwie się w ciągu 2–3 dni roboczych.'}
            </p>
            {fetcher.data?.referenceId ? (
              <p className="mt-4 text-sm font-semibold text-[rgb(var(--color-accent))]">
                Numer sprawy: {fetcher.data.referenceId}
              </p>
            ) : null}
          </div>
        ) : (
          <fetcher.Form
            method="post"
            action="/api/custom-order"
            encType="multipart/form-data"
            className="grid gap-5"
            noValidate
            onSubmit={handleSubmit}
          >
            <div
              role="button"
              tabIndex={0}
              aria-label="Strefa przesyłania pliku"
              className={`cursor-pointer border border-dashed px-5 py-8 text-center transition-colors ${
                dragOver
                  ? 'border-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent))]/10'
                  : 'border-[rgb(var(--color-accent))]/35 bg-white/5 hover:border-[rgb(var(--color-accent))]/60 hover:bg-white/10'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragOver(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                const file = event.dataTransfer.files?.[0] ?? null;
                applyFile(file);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                name="attachment"
                accept="image/png,image/jpeg,image/jpg"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  applyFile(file);
                }}
              />
              <svg
                className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--color-accent))]/60"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" />
              </svg>
              <p className="text-sm">Upuść szkic lub zdjęcie inspiracji tutaj</p>
              <p className="mt-1 text-xs text-[rgb(var(--color-contrast))]/55">
                PNG, JPG — max 10 MB · opcjonalnie
              </p>
              {selectedFile ? (
                <p className="mt-3 text-sm text-[rgb(var(--color-accent))]">
                  {selectedFile.name}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="kazka-jewelry-type" className={labelClass}>
                  Rodzaj
                </label>
                <select
                  id="kazka-jewelry-type"
                  name="jewelry_type"
                  className={selectClass}
                  {...selectProps}
                  value={jewelryType}
                  onChange={(event) => setJewelryType(event.target.value)}
                >
                  <optgroup label="Pierścionki">
                    <option value="pierścionek zaręczynowy">
                      Pierścionek zaręczynowy
                    </option>
                    <option value="obrączka ślubna">Obrączka ślubna</option>
                    <option value="komplet zaręczyny i ślub">
                      Komplet (zaręczyny + ślub)
                    </option>
                  </optgroup>
                  <optgroup label="Inna biżuteria">
                    <option value="naszyjnik">Naszyjnik</option>
                    <option value="kolczyki">Kolczyki</option>
                    <option value="bransoletka">Bransoletka</option>
                    <option value="inne">Inne</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label htmlFor="kazka-stone" className={labelClass}>
                  Kamień
                </label>
                <select
                  id="kazka-stone"
                  name="stone"
                  className={selectClass}
                  {...selectProps}
                  value={stone}
                  onChange={(event) => setStone(event.target.value)}
                >
                  <option value="">Wybierz…</option>
                  {STONE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="kazka-metal" className={labelClass}>
                  Metal
                </label>
                <select
                  id="kazka-metal"
                  name="metal"
                  className={selectClass}
                  {...selectProps}
                  value={metal}
                  onChange={(event) => setMetal(event.target.value)}
                >
                  <option value="">Wybierz…</option>
                  {METAL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="kazka-budget" className={labelClass}>
                  Budżet
                </label>
                <select
                  id="kazka-budget"
                  name="budget_band"
                  className={selectClass}
                  {...selectProps}
                  defaultValue=""
                >
                  <option value="">Wybierz…</option>
                  {BUDGET_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="kazka-name" className={labelClass}>
                Imię
              </label>
              <input
                id="kazka-name"
                name="name"
                type="text"
                required
                autoComplete="given-name"
                placeholder="Twoje imię"
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="kazka-email" className={labelClass}>
                E-mail
              </label>
              <input
                id="kazka-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="twoj@email.pl"
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="kazka-vision" className={labelClass}>
                Opis wizji
              </label>
              <textarea
                id="kazka-vision"
                name="vision"
                required
                rows={4}
                placeholder={visionPlaceholder}
                className={`${fieldClass} min-h-[7rem] resize-y`}
              />
            </div>

            <div className="grid gap-3">
              <label className="flex cursor-pointer gap-2.5 text-sm leading-relaxed text-[rgb(var(--color-contrast))]/80">
                <input
                  type="checkbox"
                  name="consent_project"
                  value="1"
                  required
                  className="mt-0.5 shrink-0"
                />
                <span>Wyrażam zgodę na kontakt w sprawie mojego projektu (wymagane).</span>
              </label>
              <label className="flex cursor-pointer gap-2.5 text-sm leading-relaxed text-[rgb(var(--color-contrast))]/80">
                <input
                  type="checkbox"
                  name="consent_marketing"
                  value="1"
                  className="mt-0.5 shrink-0"
                />
                <span>Chcę otrzymywać inspiracje i nowości KAZKA (opcjonalnie).</span>
              </label>
            </div>

            {displayError ? (
              <p className="text-sm text-red-300" role="alert">
                {displayError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center border-2 border-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent))] px-10 py-4 text-xs font-bold uppercase tracking-[0.22em] text-[rgb(var(--color-primary))] transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-65 sm:w-auto"
            >
              {isSubmitting ? 'Wysyłanie…' : 'Wyślij brief'}
            </button>
          </fetcher.Form>
        )}
      </div>
    </section>
  );
}
