export interface FilmListingPageData {
  componentChunkName: string;
  path: string;
  result: Result;
  staticQueryHashes: string[];
  slicesMap: SlicesMap;
}

export interface Result {
  data: Data;
  pageContext: PageContext;
}

export interface Data {
  settings: Settings;
  page: DataPage;
  event: null;
  theater: null;
  movie: null;
  movieUnion: null;
}

export interface DataPage {
  id: string;
  name: string;
  type: string;
  hasBodyOnly: boolean;
  metaContent: MetaContent;
  parentType: null;
  relatedEntity: null;
  childPages: ChildPageElement[];
  parent: null;
  widgets: PageWidget[];
}

export interface ChildPageElement {
  slug: string;
  relatedEntity: RelatedEntity;
}

export interface RelatedEntity {
  __typename: "Movie";
  id: string;
}

export interface MetaContent {
  title: string;
  imageUrl: null;
  description: string;
}

export interface PageWidget {
  id: string;
  __typename: string;
  cardsShape?: CardsShape;
  spacerShape?: SpacerShape;
  sectionShape?: SectionShape;
}

export interface CardsShape {
  display: string;
  cards: Card[];
  columns: number;
  carouselDensity: string;
  carouselAutoPlay: boolean;
  carouselControls: boolean;
}

export interface Card {
  image: Image;
  imageAlt: string;
  title: null;
  body: null;
  color: null;
  link: Link;
  button: null;
}

export interface Image {
  path: string;
  probe: Probe;
}

export interface Probe {
  width: number;
  height: number;
  ratio: number;
}

export interface Link {
  value: string;
  type: string;
}

export interface SectionShape {
  border: boolean;
  backgroundColor: string;
  fullWidth: boolean;
  wrapperSize: string;
  containerSize: string;
  widgets: SectionShapeWidget[];
}

export interface SectionShapeWidget {
  id: string;
  __typename: string;
  headingShape?: HeadingShape;
  spacerShape?: SpacerShape;
  freeTextShape?: FreeTextShape;
  navigationShape?: NavigationShape;
  showtimesShape?: ShowtimesShape;
}

export interface FreeTextShape {
  html: string;
}

export interface HeadingShape {
  type: string;
  text: string;
  alignment: string;
}

export interface NavigationShape {
  direction: string;
  alignment: string;
  menu: Menu;
}

export interface Menu {
  id: string;
  items: Item[];
}

export interface Item {
  id: string;
  label: string;
  url: null;
  page: ChildPage | null;
  anchor: null;
  icon: null;
  children: Child[];
}

export interface Child {
  id: string;
  label: string;
  url: null;
  page: ChildPage;
  anchor: null;
}

export interface ChildPage {
  slug: string;
  parentType: null;
  childPages: ChildPageElement[];
}

export interface ShowtimesShape {
  periodFilter: string[];
  groupType: string;
  groupBy: null;
  options: string[];
  display: string;
}

export interface SpacerShape {
  size: string;
}

export interface Settings {
  adsLocation: any[];
}

export interface PageContext {
  pagePath: string;
  pageId: string;
  pageType: string;
  movieId: string;
  theaterId: string;
  eventId: string;
  websiteId: string;
  isSingleLocation: boolean;
  circuitId: number;
  intl: Intl;
  betaFeaturesEnabled: boolean;
}

export interface Intl {
  country: Country;
  locale: Locale;
  messages: { [key: string]: string };
}

export interface Country {
  code: string;
  iso31661A2: string;
  iso31661A3: string;
}

export interface Locale {
  long: string;
  short: string;
}

export interface SlicesMap {}

// ------------- FilmsMetadataResponse

export interface FilmsMetadataResponse {
  data: FilmsMetadataResponseData;
}

export interface FilmsMetadataResponseData {
  allMovie: AllMovie;
  allMovieUnion: AllMovie;
}

export interface AllMovie {
  nodes: MovieNode[];
}

export interface MovieNode {
  id: string;
  path: string;
  title: string;
  originalTitle: string;
  casting: string[];
  certificate: null | string;
  direction: string[];
  coDirection: any[];
  genres: string;
  pictures: string[];
  heroImages: string[];
  quadImages: string[];
  poster: string;
  posterColorVibrant: null | string;
  posterColorDarkVibrant: null | string;
  release: Date | null;
  runtime: number | null;
  synopsis: string;
  trailer: Trailer;
  col: number[];
  orderIndex: number | null;
  editorialization: Editorialization;
  theaters: Theater[];
  events: Event[];
  localizations: any[];
  advisory: null | string;
  studio: Studio | null;
  overrides: Overrides;
}

export interface Editorialization {
  categories: EditorializationCategory[];
  comments: Comment[];
  links: Link[];
}

export interface EditorializationCategory {
  category: TheaterElement;
  theaters: string[];
}

export interface TheaterElement {
  id: string;
}

export interface Comment {
  id: string;
  comment: string;
  theater: null;
}

export interface Link {
  id: string;
  vendor: string;
  link: string;
}

export interface Event {
  id: string;
  path: string;
  title: string;
  shortDescription: string;
  endAt: null;
  startAt: Date | null;
  type: string;
  theaters: TheaterElement[];
  relatedMovies: RelatedMovie[];
}

export interface RelatedMovie {
  movie: TheaterElement;
  showtimes: Array<null[]>;
  showtimesTags: any[];
}

export interface Overrides {
  poster: string;
}

export interface Studio {
  name: string;
}

export interface Theater {
  col: number[];
  th: string;
  tags: string[] | null;
  isInMovieUnionOnly: boolean;
  startDate: Date | null;
}

export interface Trailer {
  HD: null;
  SD: null | string;
  youtube: string[] | null;
}

// ------------ TheatersMetadataResponse

export type TheaterMetadataResponse = {
  data: TheaterMetadataResponseData;
};

export type TheaterMetadataResponseData = {
  allTheater: AllTheater;
};

export type AllTheater = {
  nodes: TheaterNode[];
};

export type TheaterNode = {
  __typename: "Theater";
  id: string;
  path: string;
  name: string;
  screens: Screen[];
  showtimeWeekReleaseDay: number;
  timeZone: string;
  ticketingProvider: string;
  theaterGroups: any[];
  practicalInfo: PracticalInfo;
  localization: Localization;
};

export type Localization = {
  id: string;
};

export type PracticalInfo = {
  androidUrl: null | string;
  iosUrl: null | string;
  closed: boolean;
  nextOpening: NextOpening | null;
  temporaryClosure: null;
  phone: string;
  email: null;
  coordinates: Coordinates;
  images: Image[];
  localeData: LocaleData;
  location: Location;
  links: { [key: string]: null | string };
  pricing: Pricing[];
  logo: null;
};

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type LocaleData = {
  description: null | string;
};

export type Location = {
  zip: string;
  state: string;
  stateAlt: string;
  country: null | string;
  city: string;
  address: string;
};

export type NextOpening = {
  startsAt: null | string;
};

export type Pricing = {
  id: string;
  comment: null | string;
  currency: string;
  name: string;
  price: number;
};

export type Screen = {
  number: number | null;
};

// ------------ ScheduleResponse

export type ScheduleResponse = {
  [theaterId: string]: ScreeningsForTheater;
};

export type ScreeningsForTheater = {
  schedule: { [key: string]: { [key: string]: Schedule[] } };
  moviesTags: { [key: string]: string[] };
  showtimesDates: Date[];
};

export type Schedule = {
  id: string;
  startsAt: Date;
  tags: string[];
  isExpired: boolean;
  data: ScheduleData;
  occupancy: Occupancy;
};

export type ScheduleData = {
  ticketing: Ticketing[];
};

export type Ticketing = {
  urls: string[];
  type: string;
  provider: string;
};

export type Occupancy = {
  rate: number;
};
