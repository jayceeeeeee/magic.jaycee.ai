import { FR } from "../src/js/locales/fr.js";

Deno.test("French translations preserve template placeholders", () => {
  const placeholders = (text: string) =>
    [...text.matchAll(/\{([a-zA-Z]+)\}/g)].map((match) => match[1]).sort().join(
      ",",
    );
  for (const [english, french] of Object.entries(FR)) {
    if (!french || placeholders(english) !== placeholders(french)) {
      throw new Error(`Invalid translation: ${english}`);
    }
  }
});

Deno.test("Every seeded notification title, paragraph and action has a French translation", async () => {
  const seed = await Deno.readTextFile(
    new URL("../supabase/seed.sql", import.meta.url),
  );
  let count = 0;
  let definitions = 0;
  for (const match of seed.matchAll(/'((?:\{[^\n]+\}))'::jsonb/g)) {
    definitions++;
    const content = JSON.parse(match[1].replaceAll("''", "'"));
    const texts = [
      content.actionLabel,
      ...(Array.isArray(content.text) ? content.text : [content.text]),
    ].filter(Boolean);
    for (const text of texts) {
      count++;
      if (!Object.hasOwn(FR, text)) {
        throw new Error(`Untranslated notification: ${text}`);
      }
    }
  }
  for (const title of ["Quest", "Notification", "Unlocked"]) {
    if (!Object.hasOwn(FR, title)) throw new Error(`Missing ${title}`);
  }
  if (definitions !== 15 || count < 20) {
    throw new Error("Notification catalog was not fully inspected");
  }
});
