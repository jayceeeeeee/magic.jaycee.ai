export const initButtonPressFeedback = () => {
  document.querySelectorAll("button").forEach((button) => {
    button.addEventListener("pointerdown", () => {
      if (button.classList.contains("is-locked")) {
        return;
      }

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
};
