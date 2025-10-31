import { type Request, type Response } from "express";
import { create as createHandlebars } from "express-handlebars";
import {
  dateFormatter,
  dateTimeFormatter,
  timeFormatter,
} from "../../commonValues.ts";

export function wrapErrors(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error: any) {
      console.error(error);
      res
        .status(500)
        .contentType("text/plain")
        .send(`Error: ${error.message ?? error.toString()}`);
    }
  };
}

export const hbs = createHandlebars({
  helpers: {
    space(str: string) {
      return " ".repeat("12:00 pm".length - str.length);
    },

    formatDate(date: Date, padding: number) {
      const formatted = dateFormatter.format(date);

      if (padding) {
        return formatted.padStart(padding, "0");
      }
      return formatted;
    },

    formatTime(date: Date, padding: number) {
      const formatted = timeFormatter.format(date);
      if (padding) {
        return formatted.padStart(padding, "0");
      }
      return formatted;
    },

    formatDateTime(date: Date) {
      return dateTimeFormatter.format(date);
    },
  },
});
