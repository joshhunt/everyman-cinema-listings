import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.ts";
import { logger } from "../o11y/logger.ts";

const log = logger.child({ module: "runtimes" });

/**
 * Film runtimes, imported from Vista's OCAPI (`/ocapi/v1/films`, which carries
 * `runtimeInMinutes`). Everyman's listings feed has runtime null on every film,
 * so this is the only source.
 *
 * OCAPI needs a bearer token that only their web client is handed, and the
 * pages exposing one are Cloudflare-gated against server-side fetches. So the
 * import happens in the browser and only titles and runtimes are sent here.
 * Runtimes don't change, so it only needs repeating when new films appear.
 */
export interface ImportedFilm {
  title: string;
  runtimeInMinutes: number;
}

interface Store {
  updatedAt: number;
  films: ImportedFilm[];
}

const storePath = path.join(config.cacheDir, "runtimes.json");

let store: Store = { updatedAt: 0, films: [] };
let exactIndex = new Map<string, number>();
let tokenIndex: { tokens: Set<string>; digits: string; runtime: number }[] = [];

/** Words that carry no identity, so title variants can still be compared. */
const STOPWORDS = new Set(["the", "a", "an", "and", "of", "in", "s", "presents", "present"]);

function normalise(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The film without its programme dressing. Everyman and Vista both prefix
 * strands ("Members' Preview: Tony") and annotate formats ("The Odyssey
 * (35mm)"), and they don't always agree on which.
 */
function coreTitle(title: string): string {
  const withoutFormat = title.replace(/\s*\([^)]*\)\s*$/, "");
  const withoutStrand = withoutFormat.includes(":")
    ? withoutFormat.slice(withoutFormat.indexOf(":") + 1)
    : withoutFormat;
  return normalise(withoutStrand);
}

function significantTokens(title: string): Set<string> {
  return new Set(normalise(title).split(" ").filter((w) => w && !STOPWORDS.has(w)));
}

/** Digits are identity-bearing: "Toy Story 5" is not "Toy Story". */
function digitSignature(title: string): string {
  return (normalise(title).match(/\d+/g) ?? []).sort().join(",");
}

function rebuildIndices(): void {
  exactIndex = new Map();
  tokenIndex = [];

  for (const film of store.films) {
    exactIndex.set(normalise(film.title), film.runtimeInMinutes);
    // First writer wins for the bare title: strands of one film share a
    // runtime, but a plain "Shrek 2" could legitimately differ from a
    // "Toddler Club" cut of it.
    const core = coreTitle(film.title);
    if (!exactIndex.has(core)) exactIndex.set(core, film.runtimeInMinutes);

    tokenIndex.push({
      tokens: significantTokens(film.title),
      digits: digitSignature(film.title),
      runtime: film.runtimeInMinutes,
    });
  }
}

try {
  const loaded = JSON.parse(readFileSync(storePath, "utf8"));
  // Validate before adopting: an older build wrote a different shape here.
  if (!Array.isArray(loaded?.films)) throw new Error("unrecognised runtime store");

  store = { updatedAt: loaded.updatedAt ?? 0, films: loaded.films };
  rebuildIndices();
  log.info({ films: store.films.length }, "loaded runtimes");
} catch {
  store = { updatedAt: 0, films: [] };
  log.info("no stored runtimes yet");
}

export async function importRuntimes(films: ImportedFilm[]): Promise<number> {
  const byTitle = new Map(store.films.map((f) => [f.title, f]));
  for (const film of films) {
    if (!film?.title || !Number.isFinite(film.runtimeInMinutes) || film.runtimeInMinutes <= 0) {
      continue;
    }
    byTitle.set(film.title, { title: film.title, runtimeInMinutes: film.runtimeInMinutes });
  }

  store = { updatedAt: Date.now(), films: [...byTitle.values()] };
  rebuildIndices();
  await writeFile(storePath, JSON.stringify(store));
  log.info({ received: films.length, known: store.films.length }, "imported runtimes");
  return store.films.length;
}

/**
 * Runtime in minutes for a film title.
 *
 * Falls back to token matching because Vista abbreviates for its point-of-sale
 * fields — Everyman's "Throwback: The Lord Of The Rings: The Fellowship of the
 * Ring" is Vista's "Throwback: The Fellowship of the Ring". A candidate has to
 * be a token subset one way or the other, agree on any numbers, and be the only
 * such match, so near-misses stay unmatched rather than guessing wrong.
 */
export function lookupRuntime(title: string): number | undefined {
  const exact = exactIndex.get(normalise(title)) ?? exactIndex.get(coreTitle(title));
  if (exact !== undefined) return exact;

  const tokens = significantTokens(title);
  const digits = digitSignature(title);
  if (tokens.size === 0) return undefined;

  let match: number | undefined;
  for (const candidate of tokenIndex) {
    if (candidate.digits !== digits) continue;

    const shared = [...candidate.tokens].filter((t) => tokens.has(t)).length;
    const subset = shared === candidate.tokens.size || shared === tokens.size;
    if (!subset || shared < 2) continue;

    if (match !== undefined && match !== candidate.runtime) return undefined; // ambiguous
    match = candidate.runtime;
  }
  return match;
}

export function runtimeStats(): { known: number; updatedAt?: string } {
  return {
    known: store.films.length,
    updatedAt: store.updatedAt ? new Date(store.updatedAt).toISOString() : undefined,
  };
}
