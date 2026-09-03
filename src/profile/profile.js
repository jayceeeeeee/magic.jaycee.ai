const sectionButtons = document.querySelectorAll("[data-section-target]");
const sectionLinks = document.querySelectorAll("[data-section-link]");
const sectionPanels = document.querySelectorAll("[data-section-panel]");
const pageTheme = document.body.dataset.theme;

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

sectionLinks.forEach((link) => {
    link.addEventListener("click", () => {
        showSection(link.dataset.sectionLink, { updateHash: true });
    });
});

window.addEventListener("hashchange", () => {
    showSection(window.location.hash.slice(1));
});

function applyPageTheme() {
    if (pageTheme && window.JayceeShared) {
        window.JayceeShared.setTheme(pageTheme);
    }
}

const initialSection = getKnownSection(window.location.hash.slice(1) || defaultSection);
showSection(initialSection);

if (initialSection === defaultSection && window.location.hash) {
    history.replaceState(null, "", getSectionUrl(defaultSection));
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", applyPageTheme);
} else {
    applyPageTheme();
}
