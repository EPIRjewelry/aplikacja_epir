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
    eyebrow: 'Rzeźbione ogniem, inspirowane chaosem natury',
    heroHeadline: 'Rzemiosło premium z dolnośląskiego lasu — srebro, które pamięta ogień.',
    heroSub:
      'Ekskluzywna biżuteria artystyczna: ciemny las, organiczna forma i praca rąk. Bestsellery pracowni EPIR — bez fabrycznej powtarzalności.',
    primaryCta: 'Odkryj bestsellery',
    secondaryCta: 'Zaprojektuj z nami online',
    manifestoEyebrow: 'Niedoskonały z Założenia',
    manifestoTitle: 'Imperfect by Design',
    manifestoBody: [
      'Odrzucamy sterylną, maszynową biżuterię. Asymetria gałęzi, pory metalu i ślady narzędzi to znaki ludzkiej ręki — nie wady produkcji.',
      'Każdy bestseller z tej kolekcji nosi historię procesu: od inspiracji leśnej po odlew i ręczne wykończenie we Wrocławiu.',
    ],
    quote:
      'Prawdziwy luksus rodzi się w błędzie i unikalności, nie w seryjnym szablonie.',
    processSteps: SHARED_PROCESS,
    featuredEyebrow: 'Flagowy model',
    featuredTitle: 'Pierścień „Gałązki" z Czarnym Turmalinem',
    featuredBody: [
      'Surowy czarny turmalin osadzony w gałązkowatych szponach srebra 925. Metal zachowuje ślady młotka i głębokiej oksydacji — rzeźba, nie filtr.',
      'Dotykając go, czujesz chłodny kamień i ciepło metalu jednocześnie: minerał i organiczna forma w jednej kompozycji.',
    ],
    technicalBadge:
      'Srebro próby 925, poddane selektywnej, głębokiej oksydacji i ręcznemu polerowaniu.',
    gridEyebrow: 'Bestsellery pracowni',
    gridHeading: 'Wybrane dla Ciebie',
    moreLabel: 'Zobacz więcej',
    cocreateEyebrow: 'Twój pomysł. Nasz ogień.',
    cocreateTitle: 'Nie znalazłeś swojego ideału? Zaprojektujmy go razem online.',
    heroMode: 'dark',
    description:
      'Rzemiosło premium EPIR — srebrna biżuteria artystyczna inspirowana lasem, kuta we Wrocławiu.',
  },
  'artisan-rings-landing': {
    eyebrow: 'Pierścionki jako rzeźba',
    heroHeadline: 'Pierścionki artystyczne — forma, która nie boi się tekstury.',
    heroSub:
      'Srebrne pierścionki z polskiej pracowni: unikalne formy, kamienie naturalne i ślady ręcznego wykończenia.',
    primaryCta: 'Zobacz pierścionki',
    secondaryCta: 'Zaprojektuj swój pierścień',
    manifestoEyebrow: 'Niedoskonały z Założenia',
    manifestoTitle: 'Imperfect by Design',
    manifestoBody: [
      'Każdy pierścień to mała rzeźba — nie idealnie gładki szablon z katalogu masowego.',
      'Wybieramy kamienie i formy, które współpracują z metalem, zamiast ukrywać proces za filtrem marketingowym.',
    ],
    quote:
      'Prawdziwy luksus rodzi się w błędzie i unikalności, nie w seryjnym szablonie.',
    processSteps: SHARED_PROCESS,
    featuredEyebrow: 'Flagowy model',
    featuredTitle: 'Pierścień z organicznej linii Gałązki',
    featuredBody: [
      'Gałązkowate szpony i żywy kontur — pierścień, który wygląda jak znaleziony w lesie i odlany w srebrze.',
      'Ręczna oksydacja podkreśla głębię reliefu; kamień naturalny domyka kompozycję.',
    ],
    technicalBadge:
      'Srebro próby 925, selektywna oksydacja, ręczne polerowanie i osadzenie kamienia.',
    gridEyebrow: 'Pierścionki z pracowni',
    gridHeading: 'Wybrane pierścionki',
    moreLabel: 'Zobacz więcej',
    cocreateEyebrow: 'Twój pomysł. Nasz ogień.',
    cocreateTitle: 'Zaprojektuj pierścień, którego nie ma w katalogu.',
    heroMode: 'light',
    description:
      'Pierścionki artystyczne EPIR — srebro, kamienie naturalne, proces 3D i odlew we Wrocławiu.',
  },
  'artisan-new-landing': {
    eyebrow: 'Świeżo z warsztatu',
    heroHeadline: 'Nowości w pracowni — biżuteria, która dopiero opuściła ogień.',
    heroSub:
      'Najnowsze projekty EPIR: forma, materiał i detale wykończenia prosto z wrocławskiej pracowni.',
    primaryCta: 'Zobacz nowości',
    secondaryCta: 'Zaprojektuj z nami online',
    manifestoEyebrow: 'Niedoskonały z Założenia',
    manifestoTitle: 'Imperfect by Design',
    manifestoBody: [
      'Nowe modele nie są „kolekcją sezonu" z taśmy — to kolejne eksperymenty formy, kamienia i metalu.',
      'Pokazujemy proces: od inspiracji i modelu 3D po odlew i ręczne wykończenie.',
    ],
    quote:
      'Prawdziwy luksus rodzi się w błędzie i unikalności, nie w seryjnym szablonie.',
    processSteps: SHARED_PROCESS,
    featuredEyebrow: 'Świeży projekt',
    featuredTitle: 'Nowe formy z linii organicznej',
    featuredBody: [
      'Każda nowość przechodzi tę samą drogę: inspiracja, rzeźba 3D, odlew, wykończenie dłonią.',
      'Szukasz konkretnego kamienia albo metalu? Współtwórz z nami model, którego jeszcze nie ma.',
    ],
    technicalBadge:
      'Srebro 925 lub złoto — odlew i ręczne wykończenie w pracowni EPIR we Wrocławiu.',
    gridEyebrow: 'Nowości',
    gridHeading: 'Dopiero z warsztatu',
    moreLabel: 'Zobacz więcej',
    cocreateEyebrow: 'Twój pomysł. Nasz ogień.',
    cocreateTitle: 'Zróbmy kolejną nowość — Twoją.',
    heroMode: 'light',
    description:
      'Nowości EPIR Art Jewellery — świeże projekty z wrocławskiej pracowni.',
  },
  'artisan-gold-landing': {
    eyebrow: 'Ciepło metalu, nie fabryczny połysk',
    heroHeadline: 'Złoto formowane jak gałąź — nie fabryczny połysk, lecz ciepło pracowni.',
    heroSub:
      'Biżuteria ze złota z polskiej pracowni: organiczna forma, kamienie naturalne i ten sam proces cyfrowo-rzemieślniczy co w srebrze.',
    primaryCta: 'Odkryj złoto',
    secondaryCta: 'Zaprojektuj z nami online',
    manifestoEyebrow: 'Niedoskonały z Założenia',
    manifestoTitle: 'Imperfect by Design',
    manifestoBody: [
      'Złoto nie musi być gładkim lustrem z katalogu. U nas zachowuje żywą powierzchnię, ślady narzędzi i rzeźbiarski kontur.',
      'Ten sam proces co w srebrze — inspiracja, model 3D, odlew, ręczne wykończenie — tylko metal niesie inne ciepło.',
    ],
    quote:
      'Prawdziwy luksus rodzi się w błędzie i unikalności, nie w seryjnym szablonie.',
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
    cocreateEyebrow: 'Twój pomysł. Nasz ogień.',
    cocreateTitle: 'Zaprojektuj złoty model, którego nie ma w katalogu.',
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
