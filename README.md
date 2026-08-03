# Everyman cinema listings

A dense, fast view of what's on at [Everyman](https://www.everymancinema.com)
cinemas. Scrapes the Everyman website's data feeds and renders two views:

- **By film** (`/`) — each selected cinema in a column, each film with its
  upcoming screening times. Mark films as seen to collapse them.
- **By day** (`/day`) — one cinema at a time: what's showing today, tomorrow,
  and each day after, with genre and screening badges (baby club, CC,
  silver screen, almost full…).
- **By screen** (`/screen`) — one cinema at a time, each day broken down by
  auditorium, so you can see what's playing where. Consecutive showings of the
  same film are grouped, so a screen's day reads as a programme.

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
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | enables trace export |

## How it gets the data

Everyman's site is a Gatsby app. The scraper follows the same path the site
does: discover the current build hash from the film-listing page, download the
build's static query payloads (film + cinema metadata), then POST to the box
office schedule API per cinema. Everything is cached on disk with
stale-while-revalidate, so pages render from memory and refresh in the
background. See `src/everyman/client.ts` for the upstream quirks this has to
work around.
