export const runInvitePasswordTests = async (source) => {
  if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const stored = new Map();
  const updates = [];
  const navigations = [];
  let failure = null;
  let session = { user: { id: 'invited' } };
  const client = { auth: {
    getSession: async () => ({ data: { session } }),
    getUser: async () => ({ data: { user: session?.user } }),
    updateUser: async (data) => { updates.push(data); return { error: failure }; },
    signOut: async () => { session = null; return {}; }
  } };
  const win = {
    location: { hash: '#type=invite&access_token=fake', replace: path => navigations.push(path) },
    sessionStorage: { getItem: key => stored.get(key), setItem: (key,value) => stored.set(key,value), removeItem: key => stored.delete(key) },
    JayceeAuth: { getSupabaseClient: async () => client },
    JayceeUI: { waitForSound: async () => {} }
  };
  const start = async () => { new Function('window','document',source)(win,document); await tick(); return document.querySelector('.invite-password-dialog'); };
  let dialog = await start();
  assert(dialog?.open, 'Invitation did not show password setup');
  dialog.remove();
  win.location.hash = '';
  dialog = await start();
  assert(dialog?.open, 'Reload lost unfinished invitation setup');
  const form = dialog.querySelector('form');
  const submit = () => form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  form.elements.password.value = 'some-password';
  form.elements.confirmation.value = 'other-password';
  submit(); await tick();
  assert(updates.length === 0 && dialog.textContent.includes('Passwords do not match'), 'Mismatched password reached Auth');
  form.elements.confirmation.value = 'some-password';
  failure = { message: 'Password is too weak' };
  submit(); await tick();
  assert(dialog.textContent.includes(failure.message) && stored.size === 1 && !navigations.length, 'Failed password update lost pending setup');
  failure = null;
  submit(); await tick();
  assert(updates.at(-1).password === 'some-password' && stored.size === 0 && navigations.at(-1) === '/game.html', 'Successful password setup did not finish');
  dialog.remove();
  assert(!await start(), 'Normal login opened invitation setup');
  win.location.hash = '#type=invite'; session = null;
  dialog = await start();
  assert(dialog.querySelector('[type=submit]').disabled && dialog.textContent.includes('expired'), 'Missing session allowed setting a password');
  dialog.querySelector('[data-invite-exit]').click(); await tick();
  assert(stored.size === 0 && navigations.at(-1) === '/login.html', 'Exit failed to clear unfinished invitation');
  dialog.remove();
  session = { user: { id: 'invited' } };
  dialog = await start();
  const changedForm = dialog.querySelector('form');
  changedForm.elements.password.value = changedForm.elements.confirmation.value = 'new-password';
  const count = updates.length;
  session = { user: { id: 'another-user' } };
  changedForm.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); await tick();
  assert(updates.length === count && dialog.textContent.includes('session has changed'), 'Setup changed another accounts password after a session switch');
  dialog.remove();
  win.location.hash = '';
  assert(!await start() && stored.size === 0, 'Unfinished setup leaked to a different account');
};
