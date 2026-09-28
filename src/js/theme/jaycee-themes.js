(function () {
    const defaultTheme = "aurora";
    const options = [
        { label: "Aurora", value: "aurora" },
        { label: "Lotus", value: "lotus" },
        { label: "Matrix", value: "matrix" },
        { label: "Saffron", value: "saffron" },
    ];
    const values = new Set(options.map((option) => option.value));

    function normalizeTheme(theme) {
        const value = theme === null || theme === undefined ? "" : String(theme).trim();

        return values.has(value) ? value : defaultTheme;
    }

    window.JayceeThemes = Object.freeze({
        defaultTheme,
        normalizeTheme,
        options: Object.freeze(options.map((option) => Object.freeze({ ...option }))),
    });
})();
