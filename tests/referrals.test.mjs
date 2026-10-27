export const runReferralTests = async ({ referralSource, authSource, dataSource }) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const entries = new Map();
  const storage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) };
  const context = (href, localStorage = storage) => {
    const win = { location: new URL(href), localStorage };
    new Function('window', referralSource)(win);
    return win;
  };
  let win = context('https://example.test/?ref=Cedricjbt');
  assert(win.JayceeReferral.getUsername() === 'Cedricjbt', 'Root referral was not captured');
  for (const path of ['/lore.html', '/prayer.html', '/game.html', '/signup.html?full_name=Invited']) {
    win = context(win.JayceeReferral.withReferral(path));
    assert(win.JayceeReferral.getUsername() === 'Cedricjbt', 'Referral was lost in the workflow');
  }
  assert(win.JayceeReferral.createLink('Name & space') === 'https://example.test/?ref=Name+%26+space', 'Referral link did not encode the username');
  assert(!new URL(win.JayceeReferral.withReferral('https://other.test/')).searchParams.has('ref'), 'Referral leaked to another origin');
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
  let privateWin = context('https://example.test/?ref=Yogananda', blocked);
  privateWin = context(privateWin.JayceeReferral.withReferral('/signup.html'), blocked);
  assert(privateWin.JayceeReferral.getUsername() === 'Yogananda', 'URL fallback lost the referral without storage');

  let submitted;
  let rejectSignup = true;
  const client = { auth: { signUp: async (input) => {
    submitted = input;
    return rejectSignup ? { error: { message: 'Try again' } } : { data: { user: { id: 'new-user', identities: [{}] }, session: null }, error: null };
  } } };
  win.supabase = { createClient: () => client };
  win.JayceeConfig = { supabaseUrl: 'https://dev.example.test', supabasePublishableKey: 'test-public-key' };
  const doc = { readyState: 'loading', addEventListener() {}, querySelector: () => ({ addEventListener() {} }) };
  new Function('window', 'document', authSource)(win, doc);
  await win.JayceeAuth.signUp('invited@example.test', 'password', { data: { full_name: 'Invited', birth_profile: { fullName: 'Invited' } } });
  assert(win.JayceeReferral.getUsername() === 'Cedricjbt', 'Failed signup cleared the referral');
  rejectSignup = false;
  await win.JayceeAuth.signUp('invited@example.test', 'password', { data: { full_name: 'Invited', birth_profile: { fullName: 'Invited' } } });
  assert(submitted.options.data.referral_username === 'Cedricjbt' && submitted.options.data.full_name === 'Invited'
    && submitted.options.data.birth_profile.fullName === 'Invited', 'Signup did not send referral metadata alongside the existing fields');
  assert(!win.JayceeReferral.getUsername(), 'Successful signup retained stale attribution');
  await win.JayceeAuth.signUp('direct@example.test', 'password');
  assert(submitted.email === 'direct@example.test' && !submitted.options.data.full_name,
    'Email-only signup must reach Supabase without a prayer or name');

  const data = new Function('JAYCEE_GAME_SKILL_COLUMNS', dataSource + '\nreturn {fetchProfileByUserId,fetchPublicProfiles};')([]);
  const selections = [];
  const legacyClient = { from() { return { select(columns) { selections.push(columns); return {
    eq() { return { maybeSingle: async () => columns.includes('referrer_id')
      ? { data: null, error: { code: '42703', message: 'column profiles.referrer_id does not exist' } }
      : { data: { id: 'legacy-user' }, error: null } }; }
  }; } }; } };
  assert((await data.fetchProfileByUserId(legacyClient, 'legacy-user')).id === 'legacy-user' && selections.length === 2,
    'Preparing the migration broke profiles on the not-yet-migrated database');
  const lookupCalls = [];
  const publicClient = { rpc: async (name, args) => {
    lookupCalls.push({ name, args });
    return { data: name === 'list_public_masters' ? [{ id: 'featured' }] : [{ id: 'inviter', username: 'Inviter' }], error: null };
  } };
  const withInviter = await data.fetchPublicProfiles(publicClient, 1, { referrerId: 'inviter' });
  assert(withInviter.length === 2 && lookupCalls[1].args.p_referrer_id === 'inviter', 'Referrer outside the discovery page was lost');
  publicClient.rpc = async (name) => ({ data: name === 'list_public_masters' ? [{ id: 'featured' }] : [], error: null });
  assert((await data.fetchPublicProfiles(publicClient, 1, { referrerId: 'private' })).length === 1, 'Private inviter was added to public profiles');
};
