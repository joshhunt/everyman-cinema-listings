# Everyman cinema listings

A dense, fast view of what's on at [Everyman](https://www.everymancinema.com)
cinemas. Scrapes the Everyman website's data feeds and renders two views:

- **By film** (`/`) — each selected cinema in a column, each film with its
  upcoming screening times. Mark films as seen to collapse them. Everyman's
  toddler strand starts collapsed, at the bottom of each column.
- **By day** (`/day`) — one cinema at a time: what's showing today, tomorrow,
  and each day after, with genre and screening badges (baby club, CC,
  silver screen, almost full…).
- **By screen** (`/screen`) — one cinema at a time, drawn to scale: screens as
  lanes on a time axis, so you can see what's playing where and when the gaps
  are.

Switching view keeps whichever cinema you were looking at.

## Screening times and durations

The advertised time is when the room opens — the feature starts **25 minutes
later**, after ads and trailers. The calendar shows that leading band hatched,
and the time on each block is when the film actually starts.

Everyman's own feed has no runtime (`runtime` is null on every film), so
runtimes come from TMDB. Set `TMDB_READ_API_KEY` to a TMDB API Read Access
Token — a `.env` file works, it's loaded at startup.

Lookups happen in the background and are cached on disk, so a page render never
waits on TMDB: an uncached film shows an estimated length until the lookup
lands, and cached runtimes are reused indefinitely.

There is no shared id with TMDB, so films are matched on title. Everyman dress
titles up with programme strands and format notes, so `src/everyman/tmdb.ts`
tries progressively cleaned-up variants — dropping `(4K Restoration)`-style
annotations, strand prefixes like `Throwback:` and `Toddler Club:`, sing-along
suffixes, and possessive credits (`Dr Seuss' The Lorax` → `The Lorax`). A
parenthesised year (`Solaris (1972)`) is used to disambiguate re-releases. A
candidate only counts as a match if the titles are equal once normalised, so a
failed clean-up leaves the film unmatched rather than borrowing another film's
runtime.

Anything unmatched — usually shorts compilations like `Toddler Club: Stick Man
+ Superworm` — falls back to an estimate derived from the schedule: the
shortest gap between consecutive showings on one screen, which is ads + film +
changeover. Those blocks get a dashed trailing edge and a `~` on the end time.

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

Everyman's ticketing site only accepts a member session when the link lands on
`/api/launch/ticketing/redirect/<id>?requestData=<session token>`. The token
lives in a cookie on `everymancinema.com` that no other origin can read, so it
has to be handed over once, from a page on their site.

Open `/connect` and use the bookmarklet there while logged in to Everyman. After
that, booking links go straight to seat selection, signed in, in one redirect.

The bookmarklet targets whatever host you load `/connect` from (set
`SITE_ORIGIN` if a proxy rewrites `Host`). Two deployment notes: serve this over
**https**, because Chrome blocks requests from Everyman's https pages to an
`http://` origin; and if the server is on a LAN or VPN address, Chrome's
private-network check applies — the preflight opts in, but if a browser still
refuses, `/connect` has a copy-and-paste fallback that avoids cross-origin
requests entirely.

Booking links point at this app's own `/book/<id>`, which attaches a
freshly-refreshed token at click time. That keeps the token out of the page
source and out of `Referer` headers, and means the token is never stale. The
token is refreshed in the background every few minutes; if it ever expires,
links fall back to the logged-out flow and you can click the bookmarklet again.

Member login itself is Cloudflare Turnstile-protected, so this app cannot (and
does not) log in for you or handle your password.

## JSON API

For native clients. Stateless: no cookies, and it never uses the member
session, so `bookingUrl` is the plain logged-out purchase link.

- `GET /api/v1/theaters` — every cinema: `id`, `name`, `timeZone`, `url`.
- `GET /api/v1/theaters/:id/screenings?from=YYYY-MM-DD&to=YYYY-MM-DD` —
  upcoming screenings at one cinema, flat and sorted, plus the `movies` they
  reference (`certificate`, `genres`, `release`, TMDB `runtimeMinutes`).
  `from` defaults to today, `to` to everything scraped. Each screening has the
  raw `tags`, `screen`, `occupancyRate` (percent sold), `showtimeId`,
  `bookingUrl` and raw `ticketing` entries.

Times are cinema-local wall-clock strings with no offset; pair them with the
theater's `timeZone`. Errors are `{ "error", "message" }` with 400/404/502.

## Settings

Stored in cookies, changed from the page footer: selected cinemas, days ahead,
and seen films. The Everyman session is held server-side, so this is a
single-user tool — don't expose it to the internet as-is.

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
| `CACHE_DIR` | `.cache` | where the upstream cache and member session are persisted |
| `SITE_ORIGIN` | `http://localhost:$PORT` | origin baked into the connect bookmarklet |
| `TMDB_READ_API_KEY` | unset | TMDB Read Access Token, for film runtimes |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | enables trace export |

## How it gets the data

Everyman's site is a Gatsby app. The scraper follows the same path the site
does: discover the current build hash from the film-listing page, download the
build's static query payloads (film + cinema metadata), then POST to the box
office schedule API per cinema. Everything is cached on disk with
stale-while-revalidate, so pages render from memory and refresh in the
background. See `src/everyman/client.ts` for the upstream quirks this has to
work around.
