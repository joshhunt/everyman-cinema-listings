import { html, layout, type Html } from "./layout.ts";
import { ADS_MINUTES } from "../everyman/service.ts";

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

/**
 * Import film runtimes from Vista's OCAPI. Runs on their web client, which is
 * the only place a browsing token is handed out; the token stays in the browser
 * and only titles and runtimes are sent here.
 */
function runtimesBookmarklet(): string {
  // Copies to the clipboard rather than posting here directly: that origin
  // stalls cross-origin requests to a private address, so a paste is reliable.
  return `javascript:(async()=>{try{const h=await (await fetch('/')).text();const m=h.match(/eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]+/);if(!m){alert('No API token found. Make sure you are on web.everymancinema.com.');return}const r=await fetch('https://digital-api.everymancinema.com/ocapi/v1/films',{headers:{Authorization:'Bearer '+m[0],Accept:'application/json'}});if(!r.ok){alert('Vista API returned HTTP '+r.status);return}const j=await r.json();const a=j.films||j;const films=a.filter(f=>f.runtimeInMinutes).map(f=>({title:(f.title&&f.title.text)||f.title,runtimeInMinutes:f.runtimeInMinutes}));await navigator.clipboard.writeText(JSON.stringify({films}));alert('Copied '+films.length+' runtimes. Paste them into the listings site to finish.')}catch(e){alert('Failed: '+e.message)}})()`;
}

export function connectPage(
  connected: boolean,
  origin: string,
  error?: string,
  runtimes?: { known: number; updatedAt?: string },
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
        ${runtimes && runtimes.known > 0
          ? html`<strong class="status-ok">${runtimes.known} runtimes known</strong> — the calendar
              draws blocks as ${ADS_MINUTES} min of ads plus the film.`
          : html`<strong class="status-off">none imported</strong> — the calendar estimates block
              lengths from the schedule.`}
      </p>
      <p>
        Everyman's listings feed has no runtime for any film. Vista's booking platform does, but
        its API needs a token that only their web client is given, and that page blocks
        server-side requests. So the import runs in your browser.
      </p>
      <ol>
        <li>Drag this to your bookmarks bar: <a class="bookmarklet" href="${runtimesBookmarklet()}">Copy Everyman runtimes</a></li>
        <li>Open <a href="https://web.everymancinema.com/" target="_blank" rel="noreferrer">web.everymancinema.com</a> and click the bookmark — it copies the film list.</li>
        <li>Paste it here:</li>
      </ol>
      <form method="post" action="/connect/runtimes" class="paste-form">
        <textarea name="films" rows="3" placeholder='{"films":[{"title":"…","runtimeInMinutes":120}]}' required></textarea>
        <button type="submit">Import runtimes</button>
      </form>
      <p class="note">
        Only film titles and runtimes are sent here — the API token stays in your browser. Runtimes
        don't change, so this only needs repeating when new films appear.
      </p>
    </div>
  `;

  return layout({ title: "Everyman account", activeTab: "connect", body });
}
