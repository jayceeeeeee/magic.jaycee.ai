export const runOAuthConsentTests = async (source) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const createContext = ({ signedIn = true, userError = null, responseError = null, callback = 'https://chatgpt.com/callback?code=test', previouslyApproved = false } = {}) => {
    const nodes = new Map();
    const doc = { querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, { hidden: true, textContent: '', disabled: false, addEventListener(_type, callback) { this.click = callback; } });
      return nodes.get(selector);
    } };
    let approved = 0, denied = 0, redirected, signedOut = 0, reloaded = 0;
    const details = { authorization_id: 'request', client: { name: '<img src=x onerror=alert(1)>' }, scope: 'profile', redirect_uri: 'https://chatgpt.com/callback' };
    const client = { auth: { signOut: async (options) => { assert(options.scope === 'local', 'Account switching must use local sign out'); signedOut++; return { error: null }; }, getUser: async () => ({ data: { user: signedIn ? { email: 'test@example.test' } : null }, error: userError }), oauth: {
      getAuthorizationDetails: async () => ({ data: previouslyApproved ? { redirect_url: callback } : details, error: responseError }),
      approveAuthorization: async (_id, options) => { approved++; assert(options.skipBrowserRedirect, 'SDK redirect must be disabled for validation'); return { data: { redirect_url: callback }, error: null }; },
      denyAuthorization: async () => { denied++; return { data: { redirect_url: callback }, error: null }; }
    } } };
    const win = { location: { search: '?authorization_id=request', reload() { reloaded++; }, replace(url) { redirected = url; }, assign(url) { redirected = url; } }, JayceeAuth: { getSupabaseClient: async () => client } };
    // Extract the initializer without running the page's automatic entrypoint.
    const initializer = source.slice(0, source.lastIndexOf('if (document.querySelector'));
    const init = new Function(initializer + '\nreturn initOAuthConsent;')();
    return { init: () => init({ win, doc }), win, nodes, approved: () => approved, denied: () => denied, redirect: () => redirected, signedOut: () => signedOut, reloaded: () => reloaded };
  };
  const flush = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
  const anonymous = createContext({ signedIn: false });
  await anonymous.init();
  const login = new URL(anonymous.redirect(), 'https://dev.example.test');
  assert(login.pathname === '/login.html' && login.searchParams.get('redirect') === '/oauth-consent.html?authorization_id=request', 'Login lost the OAuth request');
  const rejectedSession = createContext({ signedIn: false, userError: { status: 401, message: 'Invalid session' } });
  await rejectedSession.init();
  assert(new URL(rejectedSession.redirect(), 'https://dev.example.test').pathname === '/login.html', 'Rejected sessions must offer login');
  for (const error of [{ status: 503, message: 'Auth temporarily unavailable' }, { message: 'Network request failed' }]) {
    const unavailable = createContext({ signedIn: false, userError: error }); await unavailable.init();
    assert(!unavailable.redirect() && !unavailable.nodes.get('[data-consent-recovery]').hidden
      && unavailable.nodes.get('[data-consent-status]').textContent === error.message,
      'Temporary Auth errors must stay on consent with recovery instead of redirecting to login');
  }
  const owner = createContext(); await owner.init();
  assert(owner.approved() === 0 && owner.denied() === 0 && !owner.nodes.get('[data-consent-details]').hidden, 'Consent must require a user decision');
  assert(owner.nodes.get('[data-consent-client]').textContent.startsWith('<img'), 'Client name must be assigned as text');
  owner.nodes.get('[data-consent-approve]').click(); await flush();
  owner.nodes.get('[data-consent-approve]').click(); await flush();
  assert(owner.approved() === 1 && owner.redirect() === 'https://chatgpt.com/callback?code=test', 'Explicit approval failed');
  const denied = createContext(); await denied.init(); denied.nodes.get('[data-consent-deny]').click(); await flush();
  assert(denied.denied() === 1 && denied.approved() === 0, 'Cancel approved the connection');
  const invalid = createContext({ callback: 'https://attacker.example/callback?code=test' });
  await invalid.init(); invalid.nodes.get('[data-consent-approve]').click(); await flush();
  assert(!invalid.redirect() && invalid.nodes.get('[data-consent-status]').textContent.includes('unexpected'), 'Unexpected callback origin was followed');
  const missing = createContext(); missing.win.location.search = ''; await missing.init();
  assert(missing.nodes.get('[data-consent-details]').hidden && missing.nodes.get('[data-consent-status]').textContent.includes('missing'), 'Missing authorization ID must fail');
  const previous = createContext({ previouslyApproved: true }); await previous.init();
  assert(!previous.redirect(), 'Previous approval must wait for Continue');
  previous.nodes.get('[data-consent-approve]').click();
  assert(previous.redirect() === 'https://chatgpt.com/callback?code=test' && previous.approved() === 0, 'Previously approved connections cannot resume');
  const accountSwitch = createContext(); await accountSwitch.init();
  accountSwitch.nodes.get('[data-consent-switch]').click(); await flush();
  const switchedLogin = new URL(accountSwitch.redirect(), 'https://dev.example.test');
  assert(accountSwitch.signedOut() === 1 && switchedLogin.searchParams.get('redirect') === '/oauth-consent.html?authorization_id=request', 'Account switching lost the request');
  const expired = createContext({ responseError: { message: 'Authorization request expired' } }); await expired.init();
  assert(!expired.nodes.get('[data-consent-recovery]').hidden && expired.nodes.get('[data-consent-details]').hidden, 'Expired requests need a recovery state');
  expired.nodes.get('[data-consent-retry]').click();
  assert(expired.reloaded() === 1, 'Retry did not reload the request');
};
