export const runAuthFlowTests = async ({ authSource, pageSource, indexSource, loreSource, prayerSource }) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const origin = 'https://example.test';
  const target = '/oauth-consent.html?authorization_id=request%26one';
  const query = `?redirect=${encodeURIComponent(target)}`;
  const setup = (path = '/login.html', search = query) => {
    const doc = document.implementation.createHTMLDocument('Auth flow');
    const values = new Map();
    const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    const win = Object.assign(new EventTarget(), {
      location: { origin, pathname: path, search, hash: '', replace(url) { this.href = url; } },
      localStorage: storage, sessionStorage: storage, setTimeout: callback => { callback(); return 1; },
      clearTimeout() {}, JayceeUI: { waitForSound: async () => {} }
    });
    win.self = win.top = win;
    new Function('window', 'document', authSource)(win, { readyState: 'loading', addEventListener() {} });
    let session = null, eligible = false, signupOptions, signups = 0, authListener;
    const client = { auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: callback => { authListener = callback; }
    }, from: () => ({ insert: async () => ({ error: null }) }) };
    Object.assign(win.JayceeAuth, {
      getSession: async () => ({ data: { session } }), getSupabaseClient: async () => client,
      canAccessSignup: () => eligible, refreshHeader: async () => {},
      signIn: async () => ({ data: { session: {} }, error: null }),
      signUp: async (_email, _password, options) => {
        signups++; signupOptions = options; eligible = false;
        return { data: { session: null, user: { identities: [{}] } }, error: null };
      }
    });
    const init = () => new Function('window', 'document', 'localStorage',
      `return ${pageSource.slice(0, pageSource.lastIndexOf('if (document.readyState'))} return initAuthPage;})();`)(win, doc, storage)();
    const mountForm = (mode = 'login') => {
      doc.body.innerHTML = `<main data-signup-gate hidden><h1 id="auth-title"></h1><p data-auth-context hidden></p>
        <form data-auth-form data-auth-mode="${mode}"><label data-auth-signup-field><input name="full_name"></label>
        <input name="email" value="test@example.test"><input name="password" value="secret123"><button class="auth-submit"></button></form>
        <p data-auth-status></p><p data-auth-switch hidden></p></main>`;
    };
    return { doc, win, storage, init, mountForm, eligible: value => { eligible = value; },
      session: value => { session = value; }, options: () => signupOptions, signups: () => signups,
      confirm: () => { session = {}; authListener?.('SIGNED_IN', session); } };
  };
  const login = setup(); login.mountForm(); await login.init();
  const signupLink = new URL(login.doc.querySelector('[data-auth-switch] a').getAttribute('href'), origin);
  assert(signupLink.pathname === '/signup.html' && signupLink.searchParams.get('redirect') === target, 'Signup link lost MCP authorization');
  assert(!login.doc.querySelector('[data-auth-context]').hidden, 'MCP login context is missing');
  login.doc.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await tick();
  assert(login.win.location.href === origin + target, 'Password login did not resume consent');

  const gate = setup('/signup.html'); gate.mountForm('signup'); await gate.init();
  const onboarding = new URL(gate.win.location.href, origin);
  assert(onboarding.pathname === '/' && onboarding.searchParams.get('redirect') === target, 'Prayer gate lost MCP authorization');

  const menu = setup('/', onboarding.search); menu.doc.body.innerHTML = '<button data-start-game></button>';
  new Function('document', 'window', indexSource)(menu.doc, menu.win);
  menu.doc.querySelector('button').click(); await tick();
  const loreUrl = new URL(menu.win.location.href, origin);
  assert(loreUrl.pathname === '/lore.html' && loreUrl.searchParams.get('redirect') === target, 'Play lost MCP authorization');

  const lore = setup('/lore.html', loreUrl.search);
  lore.doc.body.innerHTML = '<form data-lore-access><input name="full_name" value="New Player"></form>';
  new Function('document', 'window', loreSource)(lore.doc, lore.win);
  lore.doc.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await tick();
  const prayerUrl = new URL(lore.win.location.href, origin);
  assert(prayerUrl.pathname === '/prayer.html' && prayerUrl.searchParams.get('redirect') === target, 'Lore lost MCP authorization');

  const prayer = setup('/prayer.html', prayerUrl.search); prayer.storage.setItem('player_full_name', 'New Player');
  prayer.doc.body.innerHTML = '<form class="prayer-form"><textarea name="problem">Problem</textarea><textarea name="prayer">Prayer</textarea><button type="submit">Continue</button></form>';
  new Function('document', 'window', prayerSource)(prayer.doc, prayer.win);
  prayer.doc.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await tick();
  const signupUrl = new URL(prayer.win.location.href, origin);
  assert(signupUrl.pathname === '/signup.html' && signupUrl.searchParams.get('redirect') === target, 'Prayer did not continue to signup with MCP authorization');

  const signup = setup('/signup.html', signupUrl.search); signup.mountForm('signup'); signup.eligible(true);
  signup.storage.setItem('player_full_name', 'New Player'); await signup.init();
  assert(signup.doc.querySelector('[name=full_name]').value === 'New Player', 'Onboarding name was not restored');
  const loginLink = new URL(signup.doc.querySelector('[data-auth-switch] a').getAttribute('href'), origin);
  assert(loginLink.searchParams.get('redirect') === target, 'Switching back to login lost MCP authorization');
  signup.doc.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await tick();
  const emailReturn = new URL(signup.options().emailRedirectTo);
  assert(emailReturn.pathname === '/login.html' && emailReturn.searchParams.get('redirect') === target, 'Confirmation email lost MCP authorization');
  assert(signup.doc.querySelector('form').hidden && signup.doc.querySelector('[data-auth-status]').textContent.includes('confirmation link'), 'Missing email confirmation state');
  signup.mountForm('signup'); await signup.init();
  assert(!signup.win.location.href && signup.doc.querySelector('form').hidden, 'Reloading confirmation restarted onboarding');
  signup.doc.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await tick();
  assert(signup.signups() === 1, 'Waiting for confirmation allowed another signup');
  signup.confirm(); await tick();
  assert(signup.win.location.href === origin + target, 'Confirmation in another tab did not resume consent');

  const confirmed = setup('/login.html', emailReturn.search); confirmed.session({}); confirmed.mountForm(); await confirmed.init();
  assert(confirmed.win.location.href === origin + target, 'Email callback did not resume consent');
  const instantSignup = setup('/signup.html'); instantSignup.mountForm('signup'); instantSignup.eligible(true);
  instantSignup.win.JayceeAuth.signUp = async () => ({ data: { session: {}, user: { identities: [{}] } }, error: null });
  await instantSignup.init();
  instantSignup.doc.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await tick();
  assert(instantSignup.win.location.href === origin + target, 'Signup with an immediate session did not resume consent');
  const existing = setup('/signup.html'); existing.mountForm('signup'); existing.eligible(true);
  existing.win.JayceeAuth.signUp = async () => ({ data: { user: { identities: [] } }, error: null });
  await existing.init(); existing.doc.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await tick();
  assert(new URL(existing.doc.querySelector('[data-auth-switch] a').getAttribute('href'), origin).searchParams.get('redirect') === target,
    'Existing-account recovery lost MCP authorization');
  for (const invalid of ['https://evil.test', '//evil.test', '/\\evil.test', '/\n/evil.test']) {
    assert(!confirmed.win.JayceeAuth.getReturnPath(invalid), `Unsafe redirect accepted: ${invalid}`);
  }
  const normal = setup('/login.html', ''); normal.mountForm(); await normal.init();
  normal.doc.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true })); await tick();
  assert(normal.win.location.href === origin + '/game.html', 'Normal login destination changed');
};
