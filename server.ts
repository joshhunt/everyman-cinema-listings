import express from "express";
import cookieParser from "cookie-parser";
import morgan from "morgan";

import { setDaysAhead } from "./src/routes/setDaysAhead.ts";
import { setSeenMovies } from "./src/routes/setSeenMovies.ts";
import { setTheaters } from "./src/routes/setTheaters.ts";
import { indexView } from "./src/routes/indexView.ts";
import { wrapErrors, hbs } from "./src/lib/express.ts";

const port = process.env.PORT || 3000;

const app = express();
app.use(cookieParser());
app.use(morgan("dev"));

app.engine("handlebars", hbs.engine);
app.set("view engine", "handlebars");
app.set("views", "./views");
app.use(express.static("./views"));

app.get("/set-theater", setTheaters);
app.get("/set-days-ahead", setDaysAhead);
app.get("/set-seen", setSeenMovies);
app.get("/", wrapErrors(indexView));

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
