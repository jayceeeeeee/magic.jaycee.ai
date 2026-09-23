const SUPABASE_URL = "https://ndtnfwyfdfdcxljvvjfd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_lMEHC2xjlGGmTnkI5G-okg_0AVRhiDd";
const SUPABASE_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
const TENKI_FRACTALS_TABLE = "tenki_fractals";
const CODE_COLUMNS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export const MAIN_CORE_SQUARE_LANGUAGE = {
  label: "hex_code",
  order: "direct"
};
export const MAIN_CORE_RING_LANGUAGE = {
  label: "alien_code",
  order: "jaycee"
};

let supabaseClientPromise = null;

const loadScript = (src) => new Promise((resolve, reject) => {
  const existingScript = document.querySelector(`script[src="${src}"]`);

  if (existingScript) {
    existingScript.addEventListener("load", resolve, { once: true });
    existingScript.addEventListener("error", reject, { once: true });
    if (window.supabase) resolve();
    return;
  }

  const script = document.createElement("script");
  script.src = src;
  script.async = true;
  script.addEventListener("load", resolve, { once: true });
  script.addEventListener("error", reject, { once: true });
  document.head.append(script);
});

const getSupabaseClient = async () => {
  if (window.JayceeAuth?.getSupabaseClient) {
    return window.JayceeAuth.getSupabaseClient();
  }

  if (!supabaseClientPromise) {
    supabaseClientPromise = loadScript(SUPABASE_SCRIPT_URL)
      .then(() => window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY));
  }

  return supabaseClientPromise;
};

const emptyLanguageRow = () => Object.fromEntries(CODE_COLUMNS.map((column) => [column, ""]));

const normalizeLanguageRow = (row) => Object.fromEntries(
  CODE_COLUMNS.map((column) => [column, row?.[column] || ""])
);

const fetchLanguageRows = async (labels) => {
  const client = await getSupabaseClient();
  const { data, error } = await client
    .from(TENKI_FRACTALS_TABLE)
    .select(`label, ${CODE_COLUMNS.map((column) => `"${column}"`).join(", ")}`)
    .in("label", labels);

  if (error) throw error;

  return Object.fromEntries(
    labels.map((label) => [
      label,
      normalizeLanguageRow(data?.find((row) => row.label === label))
    ])
  );
};

const getLanguageLabel = (language) => (
  typeof language === "string" ? language : language.label
);

const getLanguageOrder = (language) => (
  typeof language === "string" ? "jaycee" : language.order
);

const getDirectLabels = (languageRow) => (
  CODE_COLUMNS.map((column) => languageRow[column] || "")
);

const getJayceeOrderedLabels = (languageRow, jayceeOrder) => (
  jayceeOrder.map((number) => languageRow[String(number)] || "")
);

const getLabels = (languageRow, language, jayceeOrder) => (
  getLanguageOrder(language) === "direct"
    ? getDirectLabels(languageRow)
    : getJayceeOrderedLabels(languageRow, jayceeOrder)
);

export const loadTenkiLanguage = async ({
  coreSquareLanguage = MAIN_CORE_SQUARE_LANGUAGE,
  coreRingLanguage = MAIN_CORE_RING_LANGUAGE,
  jayceeOrder
}) => {
  const coreSquareLabel = getLanguageLabel(coreSquareLanguage);
  const coreRingLabel = getLanguageLabel(coreRingLanguage);
  const languageRows = await fetchLanguageRows([coreSquareLabel, coreRingLabel]);

  return {
    coreRingLabels: getLabels(languageRows[coreRingLabel] || emptyLanguageRow(), coreRingLanguage, jayceeOrder),
    coreSquareLabels: getLabels(languageRows[coreSquareLabel] || emptyLanguageRow(), coreSquareLanguage, jayceeOrder)
  };
};
