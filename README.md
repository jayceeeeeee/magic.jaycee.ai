# magic.jaycee.ai

Main Jaycee.ai app.

## Structure

- `index.html` is the home page.
- Root HTML pages contain the public workflow: `index.html`, `lore.html`, `prayer.html`, `game.html`, `signup.html`, and `login.html`. `account.html` redirects to the game HUD account panel.
- `src/css/global.css` contains app-wide tokens, header, footer, auth page, and account page styles.
- `src/css/game-ui.css` contains shared game and account HUD styles.
- Root page scripts live in `src/js/` (`index.js`, `prayer.js`) or their matching feature folder.
- `src/js/config/` contains shared Jaycee data access and game configuration modules.
- `src/js/shell/shell.js` contains the app shell web components.
- `src/js/auth/` contains Supabase auth and the auth page script.
- `src/js/jaycee/` contains the account HUD, game profile runtime, and profile canvas core modules.
- `src/assets/brand/` contains Jaycee.ai logo assets.
