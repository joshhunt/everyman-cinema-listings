# Everyman cinema listings

A dense, fast view of what's on at [Everyman](https://www.everymancinema.com)
cinemas. Scrapes the Everyman website's data feeds and renders two views:

- **By film** (`/`) — each selected cinema in a column, each film with its
  upcoming screening times. Mark films as seen to collapse them.
- **By day** (`/day`) — one cinema at a time: what's showing today, tomorrow,
  and each day after, with genre and screening badges (baby club, CC,
  silver screen, almost full…).

## Running

Requires Node 24+. No build step — Node runs the TypeScript directly.

```sh
pnpm install
pnpm start        # http://localhost:3000
pnpm dev          # with file watching
pnpm typecheck    # TypeScript 7
```

Or with Docker:

```sh
docker build -t everyman-listings .
docker run -p 3000:80 everyman-listings
```

## Booking links keep you logged in

Booking links route through `everymancinema.com/login/?return=…` instead of
linking straight to the ticketing site. The Everyman site validates your
membership session and forwards you to checkout with it attached, so you stay
logged in (or log in once on the way through). Switch to raw ticketing links
with the "Booking links" setting in the page footer.

## Settings

Stored in cookies, changed from the page footer: selected cinemas, days
ahead, booking link mode, and seen films.

## Observability

- `/healthz` — liveness plus the age of each cached upstream resource.
- `/metrics` — Prometheus metrics: request durations, upstream fetch
  durations/errors, cache hit/stale/miss counts, cache age.
- Logs are JSON (pino) on stdout. Set `LOG_LEVEL=debug` for per-fetch detail.
- Traces are exported over OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

## Configuration

| Env var | Default | |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `LOG_LEVEL` | `info` | pino level |
| `CACHE_DIR` | `.cache` | where the upstream cache is persisted |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | enables trace export |

## How it gets the data

Everyman's site is a Gatsby app. The scraper follows the same path the site
does: discover the current build hash from the film-listing page, download the
build's static query payloads (film + cinema metadata), then POST to the box
office schedule API per cinema. Everything is cached on disk with
stale-while-revalidate, so pages render from memory and refresh in the
background. See `src/everyman/client.ts` for the upstream quirks this has to
work around.
