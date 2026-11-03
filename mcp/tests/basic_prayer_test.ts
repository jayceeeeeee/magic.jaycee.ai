// Execute the browser module body with a minimal DOM, localization and Supabase stub.
const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};
const source = await Deno.readTextFile(
  new URL("../../src/js/prayer.js", import.meta.url),
);

async function submit({ signedIn = false, fail = false } = {}) {
  let onSubmit: (event: any) => Promise<void> = async () => {
    throw new Error("No handler");
  };
  let inserted: any;
  const storage = new Map<string, string>();
  const button = { disabled: false };
  const status = { textContent: "", dataset: {} };
  const form = {
    reportValidity: () => true,
    querySelector: () => button,
    addEventListener: (_name: string, fn: any) => {
      onSubmit = fn;
    },
  };
  const document = {
    body: { classList: { toggle() {} } },
    documentElement: { scrollHeight: 0 },
    querySelector: (s: string) =>
      s === ".prayer-form"
        ? form
        : s === "[data-prayer-status]"
        ? status
        : null,
    querySelectorAll: () => [],
  };
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: signedIn ? { user: { id: "owner" } } : null },
      }),
    },
    from: (table: string) => {
      assert(table === "prayers", "Unexpected table");
      return {
        insert: async (row: any) => {
          inserted = row;
          return { error: fail ? new Error("Offline") : null };
        },
      };
    },
  };
  const win: any = {
    location: { origin: "https://example.test", href: "" },
    addEventListener() {},
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
    },
    JayceeAuth: { getSupabaseClient: async () => client },
  };
  win.self = win;
  win.top = win;
  class FormData {
    get(k: string) {
      return k === "problem" ? "  A concern and sadness  " : "  I seek peace  ";
    }
  }
  new Function(
    "window",
    "document",
    "FormData",
    "performance",
    "requestAnimationFrame",
    "setText",
    source.replace(/^import \{ setText \} from '\.\/i18n\.js';\r?\n/, ""),
  )(win, document, FormData, { now: () => 0 }, () => {}, (el: any, text: string) => { el.textContent = text; });
  await onSubmit({ preventDefault() {} });
  return { inserted, storage, button, status, win };
}

Deno.test("unchanged two-field form sends only canonical basic tree for guests and accounts", async () => {
  for (const signedIn of [false, true]) {
    const r = await submit({ signedIn });
    assert(
      r.inserted.process === "basic-v1" &&
        Object.keys(r.inserted.tree).sort().join() === "binah,chokmah",
      "Wrong basic tree",
    );
    assert(
      r.inserted.tree.binah.description === "A concern and sadness" &&
        r.inserted.tree.chokmah.description === "I seek peace",
      "Text changed",
    );
    assert(
      !("problem" in r.inserted) && !("prayer" in r.inserted),
      "Legacy column leaked",
    );
    assert(
      (r.inserted.user_id ?? null) === (signedIn ? "owner" : null),
      "Wrong ownership",
    );
    const pending = JSON.parse(r.storage.get("pending_prayer")!);
    assert(
      pending.tree.binah.description === r.inserted.tree.binah.description &&
        pending.active_typing_ms === 0,
      "Pending state lost content/timing",
    );
    assert(
      r.win.location.href === "/game.html",
      "Successful submission did not continue",
    );
  }
});

Deno.test("failed prayer does not advance and allows retry", async () => {
  const r = await submit({ fail: true });
  assert(
    !r.win.location.href && !r.storage.has("pending_prayer") &&
      !r.button.disabled && r.status.textContent === "Offline",
    "Failure lost retry or advanced",
  );
});
