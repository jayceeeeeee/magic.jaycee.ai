const birthForm = document.querySelector("#birth-form");
const formMessage = document.querySelector("#form-message");

birthForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(birthForm);
  const birthDate = formData.get("birth-date");
  const birthTime = formData.get("birth-time");

  formMessage.textContent = `Saved: ${birthDate} at ${birthTime}`;
});
