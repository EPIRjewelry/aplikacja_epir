# Stash review — analytics (`2026-03-23`)

## Po co powstała ta notatka

Ta notatka podsumowuje stash `wip/unrelated-local-changes-after-doc-push` i wyjaśnia:

- co z niego zostało uznane za wartościowe,
- jakie problemy próbowały rozwiązać nieudane fragmenty kodu,
- czego **nie** należy przywracać w obecnej formie.

## Co zostało zabezpieczone

Z całego stashu odzyskano tylko jedną zmianę o wysokiej wartości i niskim ryzyku:

- `workers/analytics/wrangler.toml`
  - do `ALLOWED_ORIGINS` dodano `https://zareczyny.epirbizuteria.pl`

### Dlaczego to było wartościowe

Ta zmiana najpewniej miała rozwiązać problem z odrzucaniem żądań analytics z headless storefrontu `zareczyny` przez politykę origin/CORS.

## Jakie problemy próbowały rozwiązać odrzucone fragmenty kodu

### 1. Problem: payloady `/pixel` nie zawsze były poprawnym JSON-em

Nieudane fragmenty w `workers/analytics/src/index.ts` próbowały naprawić sytuacje, w których eventy analytics przychodziły w niestandardowej lub uszkodzonej formie, np.:

- `sendBeacon` / payload tekstowy zamiast czystego JSON,
- `application/x-www-form-urlencoded`,
- stary kształt payloadu z polem `event` zamiast `type`,
- nadmiarowe backslashe lub źle zserializowany obiekt.

### 2. Problem: stare schematy D1 nie miały wszystkich kolumn

Kod próbował doraźnie ratować starsze bazy `pixel_events`, które mogły nie mieć kompletu kolumn używanych przez obecny worker, np.:

- `storefront_id`,
- `channel`,
- pola heatmap / UI events,
- pola produktowe i checkoutowe.

Celem było uniknięcie błędów typu:

- `no such column`,
- niepowodzenie `INSERT` po deployu na starszym środowisku,
- rozjazd między kodem workera a rzeczywistym schematem D1.

### 3. Problem: zapis eventów miał działać nawet na niepełnym schemacie

Nieudane fragmenty upraszczały `INSERT` do minimalnego zestawu kolumn, żeby worker mógł nadal zapisywać eventy nawet wtedy, gdy pełny schemat nie był jeszcze dostępny.

To miało ograniczyć ryzyko całkowitej utraty eventów przy częściowo zaktualizowanej bazie.

## Dlaczego te fragmenty nie zostały przywrócone wprost

### Parser payloadów był zbyt agresywny

Kod próbował akceptować niemal każdy input przez:

- usuwanie backslashy,
- regexowe „naprawianie” pseudo-JSON,
- wyciąganie fragmentów między `{` i `}`.

To mogłoby:

- maskować realne błędy po stronie klienta,
- wpuszczać śmieciowe dane,
- utrudniać debugowanie,
- generować trudne edge case’y.

### Runtime `ALTER TABLE` to zła warstwa odpowiedzialności

Worker próbował na żywo wykonywać długą listę `ALTER TABLE ... ADD COLUMN ...`.

To nie powinno być docelowym mechanizmem zgodności schematu. W tym repo problemy schematu powinny być rozwiązywane przez:

- migracje D1,
- jednorazowe naprawy schematu,
- świadome rollouty.

### Minimalny `INSERT` groził regresją danych analitycznych

Uproszczony zapis eventów rzeczywiście zwiększał odporność na stary schemat, ale jednocześnie obcinał bogatsze dane analytics.

W praktyce mogłoby to dać pozorny sukces typu „worker działa”, ale z gorszą jakością danych w BigQuery i D1.

## Co uznano za kosz

Następujące elementy nie zostały odzyskane:

- kosmetyczna zmiana w `.github/workflows/deploy-pages.yml` (`[ main ]` → `[main]`),
- testowy plik `tmp_pixel.json`,
- agresywny parser fallbacków w `workers/analytics/src/index.ts`,
- runtime-owe naprawianie schematu przez dziesiątki `ALTER TABLE`,
- regresyjny minimalny `INSERT` jako rozwiązanie docelowe.

## Rekomendacja na przyszłość

Jeśli problem wróci, warto przygotować **czysty, kontrolowany patch** obejmujący tylko:

1. ograniczony fallback parsera payloadów (`raw text` + `form-encoded` + legacy `event -> type`),
2. osobną migrację D1 dla brakujących kolumn,
3. zachowanie pełnego `INSERT`, a nie jego trwałe uproszczenie.

To pozwoli rozwiązać realne problemy ze stabilnością analytics bez zostawiania w repo doraźnego, trudnego do utrzymania kodu.
