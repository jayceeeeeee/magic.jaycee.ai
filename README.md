# magic.jaycee.ai

Main Jaycee.ai app.

## Structure

- `index.html` is the home page.
- `profile.html` is Cedric's public profile page, migrated from the old card site.
- `src/html/auth/` contains account pages: login, signup, and account.
- `src/html/levels.html` contains the square/path map.
- `src/html/jaycee.html`, `src/html/jaycee-present.html`, and `src/html/jaycee-cedricjbt.html` contain Jaycee core pages.
- `src/html/pray/` contains the prayer square page.
- `src/html/bazi.html` contains the BaZi game page.
- `src/css/global.css` contains app-wide themes, header, footer, auth page, and account page styles.
- `src/js/shell/` contains the app shell web components and theme handling.
- `src/js/auth/` contains Supabase auth, login, signup, and account behavior.
- `src/assets/brand/` contains Jaycee.ai logo assets.
- `src/css/profile.css`, `src/js/profile.js`, and `src/assets/profile/` contain profile page files.
- `src/js/bazi.js` and `src/css/bazi.css` contain the BaZi game logic and styles.
- `src/js/jaycee/` contains the Jaycee core, language loading, fractal ring helpers, and moon/sun data.
