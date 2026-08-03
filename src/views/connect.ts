import { html, layout, type Html } from "./layout.ts";

/**
 * Read the Everyman site's own `loyalty` cookie and hand the session tokens
 * over. This has to run on everymancinema.com — that cookie is not visible from
 * any other origin, which is the whole reason booking links land logged out.
 * Kept on one line so it survives being used as a `javascript:` bookmark.
 */
function pushBookmarklet(origin: string): string {
  return `javascript:(async()=>{try{const m=document.cookie.match(/(?:^|;\\s*)loyalty=([^;]*)/);if(!m){alert('Not logged in to Everyman. Log in on this site first, then click again.');return}const d=JSON.parse(decodeURIComponent(m[1]));if(!d.token||!d.refreshToken){alert('No member session found in the Everyman cookie.');return}const r=await fetch('${origin}/api/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:d.token,refreshToken:d.refreshToken})});alert(r.ok?'Connected. Booking links will now keep you logged in.':'Failed: HTTP '+r.status)}catch(e){alert('Could not reach the listings site ('+e.message+'). Use the copy/paste fallback instead.')}})()`;
}

/** Fallback: copy the session to the clipboard for pasting into the form below. */
function copyBookmarklet(): string {
  return `javascript:(async()=>{try{const m=document.cookie.match(/(?:^|;\\s*)loyalty=([^;]*)/);if(!m){alert('Not logged in to Everyman. Log in first, then click again.');return}const d=JSON.parse(decodeURIComponent(m[1]));const s=JSON.stringify({token:d.token,refreshToken:d.refreshToken});await navigator.clipboard.writeText(s);alert('Session copied. Paste it into the listings site to finish.')}catch(e){alert('Failed: '+e.message)}})()`;
}

export function connectPage(
  connected: boolean,
  origin: string,
  error?: string,
  runtimes?: { known: number; missing: number; configured: boolean },
): Html {
  const insecure = origin.startsWith("http://") && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(origin);

  const body = html`
    <div class="prose">
      <h1 class="page-title">Everyman account</h1>

      ${error ? html`<p class="status-line status-error">${error}</p>` : ""}

      <p class="status-line">
        Status:
        ${connected
          ? html`<strong class="status-ok">connected</strong> — booking links go straight to
              checkout, signed in.`
          : html`<strong class="status-off">not connected</strong> — booking links open the
              ticketing site logged out.`}
      </p>

      <h2 class="section-title">Why this is needed</h2>
      <p>
        Everyman's ticketing site only accepts a member session when the link carries a session
        token, and that token lives in a cookie on <code>everymancinema.com</code> that no other
        site can read. So it has to be handed over once, from a page on their site.
      </p>

      <h2 class="section-title">Connect</h2>
      <ol>
        <li>Drag this to your bookmarks bar: <a class="bookmarklet" href="${pushBookmarklet(origin)}">Connect Everyman</a></li>
        <li>Go to <a href="https://www.everymancinema.com/" target="_blank" rel="noreferrer">everymancinema.com</a> and make sure you're logged in.</li>
        <li>Click the bookmark. You should get a "Connected" alert.</li>
      </ol>
      <p class="note">This bookmark targets <code>${origin}</code>.</p>

      ${insecure
        ? html`<p class="status-line status-error">
              This site is served over plain <code>http://</code>. Chrome blocks requests from
              Everyman's https pages to an http origin, so the bookmark above will fail — serve
              this over https, or use the fallback below.
            </p>`
        : ""}

      <h2 class="section-title">Fallback: copy and paste</h2>
      <p class="note">
        Use this if the bookmark above can't reach this site — an
        <code>http://</code> deployment, or a browser that blocks requests to a private network
        address.
      </p>
      <ol>
        <li>Drag this to your bookmarks bar: <a class="bookmarklet" href="${copyBookmarklet()}">Copy Everyman session</a></li>
        <li>Click it on everymancinema.com while logged in — it copies the session to your clipboard.</li>
        <li>Paste it here:</li>
      </ol>
      <form method="post" action="/connect/paste" class="paste-form">
        <textarea name="session" rows="3" placeholder='{"token":"…","refreshToken":"…"}' required></textarea>
        <button type="submit">Connect</button>
      </form>

      <p class="note">
        The session token is stored on this server only, is never written to a page or a log, and
        is refreshed automatically. If it ever expires, links quietly fall back to the logged-out
        flow and you can connect again.
      </p>

      ${connected
        ? html`<p><a class="action-link" href="/disconnect">Disconnect and forget the session</a></p>`
        : ""}

      <h2 class="section-title">Film runtimes</h2>
      <p class="status-line">
        ${runtimes?.configured
          ? html`<strong class="status-ok">TMDB configured</strong> — ${runtimes.known} runtimes
              cached${runtimes.missing > 0 ? html`, ${runtimes.missing} films with no match` : ""}.`
          : html`<strong class="status-off">TMDB not configured</strong> — set
              <code>TMDB_READ_API_KEY</code> to get exact runtimes.`}
      </p>
      <p class="note">
        Everyman's feed has no runtime for any film, so the calendar looks them up on TMDB by
        title and caches them. Anything TMDB doesn't have — usually shorts compilations — falls
        back to a length estimated from the schedule.
      </p>
    </div>
  `;

  return layout({ title: "Everyman account", activeTab: "connect", body });
}
