# Kilo Code Review Guidelines dla projektu EPIR (REVIEW.md)

Poniższe zasady definiują standardy inżynieryjne, konwencje architektoniczne oraz wytyczne wizualne dla marki EPIR. Kilo Code musi bezwzględnie egzekwować te reguły podczas przeglądu kodu (Pull Requests) oraz przy generowaniu nowych komponentów interfejsu sklepu.

## 1. Kontekst Marki i Pozycjonowanie

* **DNA Marki:** EPIR to wrocławska pracownia jubilerska tworząca unikatową biżuterię artystyczną (Art Jewellery), stanowiącą alternatywę dla masowej produkcji.
* **Technologia:** Przekaz sklepu promuje dualizm technologiczny – połączenie rzeźbienia ręcznego i tradycyjnych technik złotniczych z cyfrowym projektowaniem 3D. Kod frontendu musi wspierać transparentność tego procesu.
* **Personalizacja:** Konstrukcja interfejsu zakupowego powinna uwzględniać moduły do obsługi zamówień *Custom Made* (projekty personalizowane i współtworzone z klientem).

## 2. Zasady Architektury Shopify i Kodu Liquid

* **Standardy Liquid:** Bezwzględnie używaj nowoczesnych filtrów generowania obrazów. Stosuj `image_url` z określonymi wymiarami oraz `image_tag`, kategorycznie odrzucając przestarzałe filtry `img_url` oraz `img_tag`.
* **Struktura szablonów:** Nowe układy podstron muszą być tworzone z użyciem formatu JSON dla zachowania zgodności ze standardem Online Store 2.0, unikając osadzania niepotrzebnego surowego kodu JS wewnątrz plików Liquid.
* **Brak "halucynacji" produktowych:** Zabrania się generowania zastępczych danych typu "lorem ipsum" w testowanych komponentach. Weryfikuj kod względem prawdziwej dokumentacji Shopify z wykorzystaniem narzędzi walidujących i oficjalnych schematów przez Dev MCP.

## 3. Design System i Wytyczne Wizualne (UI/UX)

* **Kolorystyka:** Tła i układy przestrzenne muszą bazować na palecie ziemistych beżów, ecru oraz ciepłych szarości. Główny akcent kolorystyczny jest definiowany dynamicznie na poziomie konkretnej kolekcji (np. z formatu HEX: `#2c684e`).
* **Kompozycja przestrzenna:** Projekty UI wymagają implementacji dużej ilości pustej przestrzeni (negative space), stawiając sam kamień i detal rzemieślniczy w centrum uwagi.
* **Zasady Typograficzne i Oświetleniowe:** Elementy i wizualizacje CSS powinny sugerować ciepłe lub neutralne światło; zabrania się stosowania zimnych tonów i nienaturalnie przesyconych barw.
* **Architektura Plików Medialnych (Krytyczne przy kodowaniu sekcji):**
  * Zawsze rezerwuj miejsce na zdjęcia standardowe o wymiarach 2048x2048 px (do 20MB) prezentujące biżuterię na gładkim tle, na dłoni, w skali makro oraz w formacie lifestyle (zakaz używania całkowicie białych teł dla lifestyle).
  * Strony kolekcji (*collection_enhanced*) muszą uwzględniać w kodzie obecność 6 dedykowanych pól dla metafieldów: *Hero Video* (zapętlone wideo, wolne, intymne ujęcia), *Texture Overlay* (kinetyczna tekstura np. lnu z kanałem alpha nakładana na sekcje), *Process Image*, *Lookbook*, *Artist Photo* oraz *Accent Color*.
  * Karta produktu musi programistycznie obsługiwać dedykowane ujęcie makro (tzw. `stone_profile`) eksponujące ekstremalne zbliżenia struktury kamienia.

## 4. Wytyczne Komunikacyjne (Tone of Voice) w Elementach Frontendowych

* **Profesjonalizm i Rzeczowość:** Język powiadomień systemowych, wezwań do akcji (CTA) i opisów ma być merytoryczny, konkretny i wolny od zbędnych ozdobników emocjonalnych.
* **Ekspertyza Technologiczna:** Kod UI powinien przewidywać wyświetlanie i ekspozycję twardych danych gemmologicznych, takich jak twardość w skali Mohsa czy precyzyjna próba kruszcu (np. pr. 585).
* **Doradztwo:** Klient powinien w punktach styku czuć, że kupuje sztukę użytkową, a interfejs i użyte opisy pełnią rolę kompetentnego doradcy i eksperta, a nie tylko sprzedawcy.

## 5. Hydrogen (kazka / zareczyny / inspiracje) — monorepo npm + Wrangler

* **Instalacja zależności:** wyłącznie z **roota** repozytorium (`npm install --legacy-peer-deps --no-audit --no-fund`). **Zabrania się** `npm install` w katalogu `apps/kazka`, `apps/zareczyny` lub `apps/inspiracje` — tworzy to legacy lockfile i lokalny Wrangler 3.x, który na Node 20 wywala się błędem `z.ostring is not a function`.
* **Dev / deploy:** `cd apps/<name> && npm run dev` oraz `npm run deploy -w <name>` (albo root `npm run pages:deploy:<name>`). Skrypty muszą używać root Wrangler 4.x: `node ../../node_modules/wrangler/bin/wrangler.js`.
* **Antywzorzec (odrzuć w PR):** `npx wrangler`, `npm exec -w … -- wrangler`, nowy plik `apps/*/package-lock.json`, surowe `wrangler pages …` bez root bin.
* **Lockfile:** jeden kanoniczny `package-lock.json` w root — nie commituj locków w `apps/*`.
* **Sekrety lokalne:** `.dev.vars` w workspace Hydrogen (gitignored); sekrety z Cloudflare Pages nie działają na `127.0.0.1` bez `.dev.vars` (np. `EPIR_CHAT_SHARED_SECRET` dla BFF czatu/consent).
