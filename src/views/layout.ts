import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

export function layout(props: {
  title: string;
  activeTab: "by-movie" | "by-day";
  body: Html;
}): Html {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${props.title}</title>
        <link rel="stylesheet" href="/public/styles.css" />
      </head>
      <body>
        <main class="main-content">
          <nav class="view-nav">
            <a href="/" class="view-tab ${props.activeTab === "by-movie" ? "active" : ""}">By film</a>
            <a href="/day" class="view-tab ${props.activeTab === "by-day" ? "active" : ""}">By day</a>
          </nav>
          ${props.body}
        </main>
        <script src="/public/app.js" defer></script>
      </body>
    </html>`;
}

export { html };
