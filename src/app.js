const modeButtons = document.querySelectorAll(".mode-button");
const modeStep = document.querySelector("#mode-step");
const birthStep = document.querySelector("#birth-step");
const birthForm = document.querySelector("#birth-form");
const formMessage = document.querySelector("#form-message");
let selectedMode = "";

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
