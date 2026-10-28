import { initJayceeAccountPage } from "./account-panel.js";

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initJayceeAccountPage(), { once: true });
} else {
  void initJayceeAccountPage();
}
