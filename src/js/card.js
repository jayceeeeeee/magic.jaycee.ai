const sectionButtons = document.querySelectorAll("[data-section-target]");
const sectionPanels = document.querySelectorAll("[data-section-panel]");

function getDefaultSection() {
    return sectionButtons[0]?.dataset.sectionTarget || sectionPanels[0]?.dataset.sectionPanel || "";
}

const defaultSection = getDefaultSection();

function getKnownSection(target) {
    return Array.from(sectionPanels).some((panel) => panel.dataset.sectionPanel === target)
        ? target
        : defaultSection;
}

function getSectionUrl(section) {
    if (section === defaultSection) {
        return `${window.location.pathname}${window.location.search}`;
    }

    return `#${section}`;
}

function showSection(target, options = {}) {
    const nextSection = getKnownSection(target);

    sectionButtons.forEach((sectionButton) => {
        const isActive = sectionButton.dataset.sectionTarget === nextSection;
        sectionButton.classList.toggle("is-active", isActive);
        sectionButton.setAttribute("aria-pressed", String(isActive));
    });

    sectionPanels.forEach((panel) => {
        const isTargetPanel = panel.dataset.sectionPanel === nextSection;
        panel.hidden = !isTargetPanel;
        panel.classList.toggle("is-visible", isTargetPanel);
    });

    if (options.updateHash) {
        history.pushState(null, "", getSectionUrl(nextSection));
    }
}

sectionButtons.forEach((button) => {
    button.addEventListener("click", () => {
        showSection(button.dataset.sectionTarget, { updateHash: true });
    });
});

document.addEventListener("click", (event) => {
    const sectionLink = event.target.closest("[data-section-link]");

    if (!sectionLink) {
        return;
    }

    event.preventDefault();
    showSection(sectionLink.dataset.sectionLink, { updateHash: true });
});

window.addEventListener("hashchange", () => {
    showSection(window.location.hash.slice(1));
});

const initialSection = getKnownSection(window.location.hash.slice(1) || defaultSection);
showSection(initialSection);

if (initialSection === defaultSection && window.location.hash) {
    history.replaceState(null, "", getSectionUrl(defaultSection));
}

