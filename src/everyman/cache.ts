import { mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.ts";
import { logger } from "../o11y/logger.ts";
import { cacheEvents, cacheAgeGauge } from "../o11y/otel.ts";

export interface CacheEntry<T> {
  createdAt: number;
  data: T;
}

export interface CacheResult<T> extends CacheEntry<T> {
  result: "hit" | "stale" | "miss";
}

interface GetOptions<T> {
  /**
   * Short name for metrics/logs ("site-hash", "schedule", ...). Unlike the
   * key, this has bounded cardinality.
   */
  resource: string;
  /** Entries younger than this are served as-is. */
  freshMs: number;
  fetcher: () => Promise<T>;
}

/**
 * Disk-persisted stale-while-revalidate cache. Fresh entries are returned
 * directly; expired entries are returned immediately while a background
 * refresh runs; only a missing entry blocks on the fetcher.
 */
export class SwrCache {
  #file: string;
  #entries: Map<string, CacheEntry<unknown>> = new Map();
  #inflight: Map<string, Promise<unknown>> = new Map();
  #writeScheduled = false;
  #log = logger.child({ module: "cache" });

  constructor(filename: string) {
    mkdirSync(config.cacheDir, { recursive: true });
    this.#file = path.join(config.cacheDir, filename);
    try {
      const raw = JSON.parse(readFileSync(this.#file, "utf8"));
      this.#entries = new Map(Object.entries(raw));
      this.#log.info({ entries: this.#entries.size, file: this.#file }, "cache loaded");
    } catch {
      this.#log.info({ file: this.#file }, "starting with empty cache");
    }

    cacheAgeGauge.addCallback((observable) => {
      const now = Date.now();
      for (const [key, entry] of this.#entries) {
        observable.observe((now - entry.createdAt) / 1000, { key });
      }
    });
  }

  async get<T>(key: string, opts: GetOptions<T>): Promise<CacheResult<T>> {
    const entry = this.#entries.get(key) as CacheEntry<T> | undefined;
    const age = entry ? Date.now() - entry.createdAt : Infinity;

    if (entry && age < opts.freshMs) {
      cacheEvents.add(1, { resource: opts.resource, result: "hit" });
      return { ...entry, result: "hit" };
    }

    if (entry) {
      cacheEvents.add(1, { resource: opts.resource, result: "stale" });
      // Serve stale, refresh in the background.
      void this.#refresh(key, opts).catch(() => {});
      return { ...entry, result: "stale" };
    }

    cacheEvents.add(1, { resource: opts.resource, result: "miss" });
    const data = (await this.#refresh(key, opts)) as T;
    return { createdAt: Date.now(), data, result: "miss" };
  }

  /** Deduplicated fetch-and-store. */
  #refresh<T>(key: string, opts: GetOptions<T>): Promise<unknown> {
    const existing = this.#inflight.get(key);
    if (existing) return existing;

    const promise = opts
      .fetcher()
      .then((data) => {
        this.#entries.set(key, { createdAt: Date.now(), data });
        this.#scheduleWrite();
        return data as unknown;
      })
      .catch((err) => {
        this.#log.error({ err, key, resource: opts.resource }, "cache refresh failed");
        throw err;
      })
      .finally(() => {
        this.#inflight.delete(key);
      });

    this.#inflight.set(key, promise);
    return promise;
  }

  #scheduleWrite() {
    if (this.#writeScheduled) return;
    this.#writeScheduled = true;
    setTimeout(() => {
      this.#writeScheduled = false;
      const obj = Object.fromEntries(this.#entries);
      writeFile(this.#file, JSON.stringify(obj)).catch((err) => {
        this.#log.error({ err }, "cache write failed");
      });
    }, 1000).unref();
  }

  /** createdAt timestamps by key, for health reporting. */
  ages(): Record<string, string> {
    return Object.fromEntries(
      [...this.#entries].map(([key, entry]) => [key, new Date(entry.createdAt).toISOString()]),
    );
  }
}

export const cache = new SwrCache("everyman-cache.json");
