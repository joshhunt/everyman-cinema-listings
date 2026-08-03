import { statSync } from "node:fs";
import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

/**
 * Static assets are served with a long max-age, so their URLs carry a version
 * taken from the file's mtime. Without it a deploy would leave browsers on the
 * old CSS for an hour.
 */
function assetVersion(file: string): string {
  try {
    return String(Math.floor(statSync(`public/${file}`).mtimeMs));
  } catch {
    return "0";
  }
}

const styleUrl = `/public/styles.css?v=${assetVersion("styles.css")}`;
const scriptUrl = `/public/app.js?v=${assetVersion("app.js")}`;

export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

export function layout(props: {
  title: string;
  activeTab: "by-movie" | "by-day" | "by-screen" | "connect";
  body: Html;
}): Html {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${props.title}</title>
        <link rel="stylesheet" href="${styleUrl}" />
      </head>
      <body>
        <main class="main-content">
          <nav class="view-nav">
            <a href="/" class="view-tab ${props.activeTab === "by-movie" ? "active" : ""}">By film</a>
            <a href="/day" class="view-tab ${props.activeTab === "by-day" ? "active" : ""}">By day</a>
            <a href="/screen" class="view-tab ${props.activeTab === "by-screen" ? "active" : ""}">By screen</a>
            <a href="/connect" class="view-tab view-tab-end ${props.activeTab === "connect" ? "active" : ""}">Account</a>
          </nav>
          ${props.body}
        </main>
        <script src="${scriptUrl}" defer></script>
      </body>
    </html>`;
}

export { html };
