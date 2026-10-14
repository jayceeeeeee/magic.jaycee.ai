import { marked } from "../vendor/marked-18.0.14.js";
import DOMPurify from "../vendor/dompurify-3.4.17.js";

export const renderSkillMarkdown = (element, markdown) => {
  const html = marked.parse(String(markdown || ""), { async: false, gfm: true });

  element.innerHTML = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["form", "input", "button", "textarea", "select", "style"],
    FORBID_ATTR: ["style"]
  });
};
