import type {HeroMode} from './design-tokens';

export type ProcessStep = {title: string; body: string};

export type LandingCopy = {
  eyebrow: string;
  heroHeadline: string;
  heroSub: string;
  primaryCta: string;
  secondaryCta: string;
  manifestoEyebrow: string;
  manifestoTitle: string;
  manifestoBody: string[];
  quote: string;
  processSteps: ProcessStep[];
  featuredEyebrow: string;
  featuredTitle: string;
  featuredBody: string[];
  technicalBadge: string;
  gridEyebrow: string;
  gridHeading: string;
  moreLabel: string;
  cocreateEyebrow: string;
  cocreateTitle: string;
  heroMode: HeroMode;
  /** Border / ikony — docelowo z metafieldu Accent Color kolekcji. */
  accentStone?: string;
  description: string;
};

const SHARED_PROCESS: ProcessStep[] = [
  {
    title: 'Inspiracja',
    body: 'Szkic, zdjęcie natury albo opis wizji — punkt wyjścia zawsze należy do Ciebie lub do lasu, który nas inspiruje.',
  },
  {
    title: 'Model 3D',
    body: 'Tłumaczymy formę na cyfrową rzeźbę. Przeglądasz i korygujesz model na ekranie telefonu, zanim metal trafi do ognia.',
  },
  {
    title: 'Odlew',
    body: 'Po Twojej akceptacji odlewamy w srebrze 925 lub złocie we wrocławskiej pracowni — każdy egzemplarz osobno.',
  },
  {
    title: 'Wykończenie',
    body: 'Selektywna oksydacja, ręczne polerowanie i osadzenie kamienia — ślady narzędzi zostają świadomie, nie przypadkiem.',
  },
];

const COPY_BY_HANDLE: Record<string, LandingCopy> = {
  'forest-premium-landing': {
    eyebrow: 'Wrocławska pracownia',
    heroHeadline: 'Srebro z żywą powierzchnią — ślad ognia, nie katalogowy połysk.',
    heroSub:
      'Bransolety, kolczyki, wisory: rzeźba przy skórze. Ten sam proces co w pierścionkach — odlew i młotek we Wrocławiu.',
    primaryCta: 'Zobacz srebro',
    secondaryCta: 'Zaprojektuj z nami online',
    manifestoEyebrow: 'Żywa powierzchnia',
    manifestoTitle: 'Ślad procesu, nie wada',
    manifestoBody: [
      'Odrzucamy sterylną, maszynową biżuterię. Asymetria gałęzi, pory metalu i ślady narzędzi to znaki ludzkiej ręki.',
      'Linia „Gałązki”: zmysłowy kontrast twardego blasku metalu z miękkością mchu — rzeźbiarskie sploty, napięcie linii.',
      'Linia „Planety”: kosmiczne tekstury i chropowatość zestawiona z czystością kamienia.',
    ],
    quote:
      'Rzemiosło, które nie dekoruje — współistnieje z dłonią.',
    processSteps: SHARED_PROCESS,
    featuredEyebrow: 'Studium formy',
    featuredTitle: 'Pierścień „Fale Wody" z szafirem',
    featuredBody: [
      'Pierścień „Fale Wody": masywna forma rzeźbiarska inspirowana ruchem cieczy. Srebro pr. 925 poddane fakturowaniu, by wydobyć głębię naturalnego szafiru. To nie jest odlew z formy — to materialny zapis energii wody.',
      'Obok: pierścień z topazem London Blue — studium naturalnego mroku. Surowa tekstura gałęzi otulająca głęboki błękit topazu.',
    ],
    technicalBadge:
      'Srebro próby 925, poddane selektywnej, głębokiej oksydacji i ręcznemu polerowaniu.',
    gridEyebrow: 'Bestsellery pracowni',
    gridHeading: 'Wybrane dla Ciebie',
    moreLabel: 'Zobacz więcej',
    cocreateEyebrow: 'Twój pomysł. Nasz ogień.',
    cocreateTitle: 'Nie ma tego w siatce? Zaprojektujmy formę razem online.',
    heroMode: 'dark',
    description:
      'Srebrna biżuteria EPIR — żywa powierzchnia, odlew i ręczne wykończenie we Wrocławiu.',
  },
  'artisan-rings-landing': {
    eyebrow: 'Zaręczyny i ślub · organiczne echo',
    heroHeadline: 'Pierścionek przy niej, nie przed nią.',
    heroSub:
      'To nie jest pierścionek z katalogu — to obietnica z fakturą. Srebro, kamień i ślad ręki z wrocławskiej pracowni.',
    primaryCta: 'Zobacz pierścionki',
    secondaryCta: 'Zaprojektuj swój pierścień',
    manifestoEyebrow: 'Cień, nie figura',
    manifestoTitle: 'Bliskość dłoni',
    manifestoBody: [
      'Segment bridal to serce marki. Zamiast sterylnej gładkości — organiczne echo i symbolika Local Flavor.',
      'Obrączka „Gałązka": ręcznie rzeźbiony wzór, więź rosnąca przez lata.',
      'Obrączki „Kora Drzewa": surowa prawda zamiast polerowanego kłamstwa.',
    ],
    quote:
      'Rzemiosło, które nie dekoruje — współistnieje z dłonią.',
    processSteps: SHARED_PROCESS,
    featuredEyebrow: 'Szept leśny',
    featuredTitle: 'Szept Leśnych Tajemnic',
    featuredBody: [
      'Organiczna forma i naturalny kamień — pierścień, który wygląda jak znaleziony w lesie i odlany świadomie, nie wygenerowany z szablonu.',
      'Indywidualny dobór kamieni i próby kruszcu (333, 585, 750) — personalizacja, którą czujesz na skórze.',
    ],
    technicalBadge:
      'Srebro próby 925 lub złoto — selektywna oksydacja, ręczne polerowanie i osadzenie kamienia.',
    gridEyebrow: 'Pierścionki z pracowni',
    gridHeading: 'Wybrane pierścionki',
    moreLabel: 'Zobacz więcej',
    cocreateEyebrow: 'Twój pomysł. Nasz ogień.',
    cocreateTitle: 'Zaprojektuj pierścień, którego nie ma w katalogu.',
    heroMode: 'light',
    description:
      'Pierścionki EPIR — zaręczyny i ślub, srebro, kamienie naturalne, proces 3D i odlew we Wrocławiu.',
  },
  'artisan-gold-landing': {
    eyebrow: 'Ciepło metalu, nie fabryczny połysk',
    heroHeadline: 'Złoto formowane jak gałąź',
    heroSub:
      'Rzeźba w złocie: żywa powierzchnia, kamienie szlachetne, ten sam ogień co w srebrze. Wrocławska pracownia.',
    primaryCta: 'Odkryj złoto',
    secondaryCta: 'Zaprojektuj z nami online',
    manifestoEyebrow: 'Żywa powierzchnia',
    manifestoTitle: 'Ślad procesu, nie wada',
    manifestoBody: [
      'Złoto nie musi być gładkim lustrem z katalogu. Zachowuje żywą powierzchnię, ślady narzędzi i rzeźbiarski kontur.',
      'Ten sam proces co w srebrze — inspiracja, model 3D, odlew, ręczne wykończenie — tylko metal niesie inne ciepło.',
      'Srebro pr. 925 traktujemy jako płótno dla oksydacji; złoto 18K — szampańskie tony, które ujawniają się z czasem. Kontrolowany chaos, nie wada.',
    ],
    quote:
      'Złoto, brylant i inne szlachetne w rzeźbie — ta sama szlachetność, inna struktura.',
    processSteps: SHARED_PROCESS.map((s, i) =>
      i === 2
        ? {
            title: 'Odlew',
            body: 'Po akceptacji odlewamy w złocie we wrocławskiej pracowni — każdy egzemplarz osobno, bez seryjnego szablonu.',
          }
        : s,
    ),
    featuredEyebrow: 'Flagowy model',
    featuredTitle: 'Złoty pierścień z linii organicznej',
    featuredBody: [
      'Złoto prowadzone jak gałąź: miękki relief, precyzyjne osadzenie kamienia i wykończenie, które nie udaje maszynowej gładkości.',
      'Ciepły metal i naturalny kamień — kompozycja, którą czujesz na dłoni, nie tylko na zdjęciu.',
    ],
    technicalBadge:
      'Złoto — odlew i ręczne wykończenie w pracowni EPIR; kamienie naturalne lub selekcjonowane.',
    gridEyebrow: 'Złoto z pracowni',
    gridHeading: 'Wybrane modele ze złota',
    moreLabel: 'Zobacz więcej',
    cocreateEyebrow: 'Digital Co-creation',
    cocreateTitle: 'Zaprojektujmy to razem online.',
    heroMode: 'light',
    accentStone: '#C9A227',
    description:
      'Biżuteria ze złota EPIR — organiczna forma, odlew i ręczne wykończenie we Wrocławiu.',
  },
};

export function getLandingCopy(handle: string): LandingCopy | null {
  return COPY_BY_HANDLE[handle] ?? null;
}

export const APEX_EDITORIAL_HANDLES = new Set(Object.keys(COPY_BY_HANDLE));
