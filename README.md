# magic.jaycee.ai

Main Jaycee.ai app.

## Structure

- `index.html` is the home page.
- `card.html` is Cedric's public card page, migrated from the old card site.
- Root HTML pages contain the public workflow: `index.html`, `lore.html`, `prayer.html`, `game.html`, `signup.html`, `login.html`, and `account.html`.
- `card.html` contains the existing Cedric/Jaycee information card.
- `src/css/global.css` contains app-wide themes, header, footer, auth page, and account page styles.
- Root page scripts live in `src/js/` (`index.js`, `prayer.js`, `card.js`) or their matching feature folder.
- `src/js/config/` contains shared Jaycee data access and game configuration modules.
- `src/js/shell/shell.js` contains the app shell web components.
- `src/js/theme/themes.js` contains theme handling.
- `src/js/auth/` contains Supabase auth and the auth page script.
- `src/js/jaycee/` contains the account page, game profile runtime, and profile canvas core modules.
- `src/assets/brand/` contains Jaycee.ai logo assets.
- `src/css/card.css`, `src/js/card.js`, and `src/assets/profile/` contain card page files.
