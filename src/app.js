const modeButtons = document.querySelectorAll(".mode-button");
const modeStep = document.querySelector("#mode-step");
const birthStep = document.querySelector("#birth-step");
const birthForm = document.querySelector("#birth-form");
const formMessage = document.querySelector("#form-message");
const siteBanner = document.querySelector(".site-banner");
let selectedMode = "";

const updateBannerSpace = () => {
  const bannerHeight = siteBanner.getBoundingClientRect().height;
  const bannerTop = Number.parseFloat(getComputedStyle(siteBanner).top) || 0;

  document.documentElement.style.setProperty("--banner-space", `${bannerHeight + bannerTop + 16}px`);
};

if ("ResizeObserver" in window) {
  new ResizeObserver(updateBannerSpace).observe(siteBanner);
}

window.addEventListener("load", updateBannerSpace);
window.addEventListener("resize", updateBannerSpace);

document.querySelectorAll("button").forEach((button) => {
  button.addEventListener("pointerdown", () => {
    button.classList.add("is-pressed");
  });

  button.addEventListener("pointerup", () => {
    button.classList.remove("is-pressed");
  });

  button.addEventListener("pointerleave", () => {
    button.classList.remove("is-pressed");
  });

  button.addEventListener("blur", () => {
    button.classList.remove("is-pressed");
  });
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedMode = button.dataset.mode;
    modeStep.hidden = true;
    modeStep.classList.remove("is-active");
    birthStep.hidden = false;
    birthStep.classList.add("is-active");
  });
});

birthForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(birthForm);
  const birthTime = formData.get("birth-time");
  const birthDay = formData.get("birth-day");
  const birthMonth = formData.get("birth-month");
  const birthYear = formData.get("birth-year");
  const birthPlace = formData.get("birth-place");

  formMessage.textContent = `${selectedMode || "game"} queued: ${birthDay}/${birthMonth}/${birthYear} at ${birthTime}, ${birthPlace}.`;
});
