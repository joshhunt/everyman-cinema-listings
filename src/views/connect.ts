import { html, layout, type Html } from "./layout.ts";
import { config } from "../config.ts";

/**
 * Read the Everyman site's own `loyalty` cookie and hand the session tokens to
 * this app. It has to run on everymancinema.com — that cookie is not visible
 * from any other origin, which is the whole reason booking links land logged
 * out. Kept on one line so it works pasted into the address bar as a
 * `javascript:` URL.
 */
function bookmarkletSource(): string {
  return `javascript:(async()=>{try{const m=document.cookie.match(/(?:^|;\\s*)loyalty=([^;]*)/);if(!m){alert('Not logged in to Everyman. Log in on this site first, then click again.');return}const d=JSON.parse(decodeURIComponent(m[1]));if(!d.token||!d.refreshToken){alert('No member session found in the Everyman cookie.');return}const r=await fetch('${config.siteOrigin}/api/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:d.token,refreshToken:d.refreshToken})});alert(r.ok?'Connected. Booking links will now keep you logged in.':'Failed: HTTP '+r.status)}catch(e){alert('Failed: '+e.message)}})()`;
}

export function connectPage(connected: boolean): Html {
  const body = html`
    <div class="prose">
      <h1 class="page-title">Everyman account</h1>

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
        <li>Drag this to your bookmarks bar: <a class="bookmarklet" href="${bookmarkletSource()}">Connect Everyman</a></li>
        <li>Go to <a href="https://www.everymancinema.com/" target="_blank" rel="noreferrer">everymancinema.com</a> and make sure you're logged in.</li>
        <li>Click the bookmark. You should get a "Connected" alert.</li>
      </ol>

      <p class="note">
        The session token is stored on this server only, is never written to a page or a log, and
        is refreshed automatically. If it ever expires, links quietly fall back to the logged-out
        flow and you can click the bookmark again.
      </p>

      ${connected
        ? html`<p><a class="action-link" href="/disconnect">Disconnect and forget the session</a></p>`
        : ""}
    </div>
  `;

  return layout({ title: "Everyman account", activeTab: "connect", body });
}
