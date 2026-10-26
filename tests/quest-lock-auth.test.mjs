export const runQuestLockAuthTests = async (source) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const userSession = { user: { id: 'user' } };
  let session = userSession;
  let access = { locked: true };
  let redirect = null;
  let delay = 0;
  let signedOut = 0;
  let loginError = null;
  const client = {
    rpc: async () => ({ data: access, error: null }),
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      signOut: async ({ scope }) => {
        assert(scope === 'local', 'Server-revoked sessions must be cleared locally');
        session = null; signedOut++; return { error: null };
      },
      signInWithPassword: async () => {
        session = loginError ? null : userSession;
        return { data: { session }, error: loginError };
      }
    }
  };
  const mockWindow = {
    JayceeConfig: { supabaseUrl: 'https://dev.example.test', supabasePublishableKey: 'test-public-key' },
    supabase: { createClient: () => client },
    clearTimeout() {}, setTimeout(_callback, milliseconds) { delay = milliseconds; return 1; },
    location: { replace(path) { redirect = path; } }
  };
  const mockDocument = {
    readyState: 'loading', addEventListener() {}, querySelectorAll: () => [],
    querySelector: () => ({ addEventListener() {} })
  };
  new Function('window', 'document', source)(mockWindow, mockDocument);
  const auth = mockWindow.JayceeAuth;
  assert(await auth.checkAccountAccess() === false && redirect === '/' && signedOut === 1,
    'An expired quest must log out and redirect home');
  redirect = null;
  const blocked = await auth.signIn('email', 'password');
  assert(blocked.error?.code === 'account_locked' && session === null && redirect === null,
    'Login before background enforcement must still reject a locked account');
  loginError = { code: 'user_banned', message: 'User is banned' };
  assert((await auth.signIn('email', 'password')).error.message.includes('locked'),
    'Auth ban must explain that the account is locked');
  loginError = null;
  access = { locked: false, deadline: new Date(Date.now() + 1000).toISOString() };
  assert(!(await auth.signIn('email', 'password')).error && delay >= 100 && delay <= 1100,
    'Unlocked login must work and schedule a deadline check');
};
