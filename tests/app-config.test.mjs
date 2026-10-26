export const runAppConfigTests = async ({ configSource, authSource }) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const productionUrl = 'https://ndtnfwyfdfdcxljvvjfd.supabase.co';
  const developmentUrl = 'https://mylnagvqngsgcmlvwttu.supabase.co';
  for (const hostname of ['magic.jaycee.ai', 'localhost', '127.0.0.1', '[::1]', 'preview.example.test', '']) {
    const win = { location: { hostname } };
    new Function('window', configSource)(win);
    const expected = hostname === 'magic.jaycee.ai' ? productionUrl : developmentUrl;
    assert(win.JayceeConfig.supabaseUrl === expected, `Wrong database for ${hostname}`);
    assert(Object.isFrozen(win.JayceeConfig), 'Configuration must be immutable');
    let connection;
    win.supabase = { createClient: (url, key) => { connection = { url, key }; return connection; } };
    const doc = { readyState: 'loading', addEventListener() {}, querySelector: () => ({ addEventListener() {} }) };
    new Function('window', 'document', authSource)(win, doc);
    const client = await win.JayceeAuth.getSupabaseClient();
    assert(client.url === expected && client.key === win.JayceeConfig.supabasePublishableKey,
      `Auth ignored the configuration for ${hostname}`);
    assert(await win.JayceeAuth.getSupabaseClient() === client, 'Auth created duplicate clients');
  }
  const win = {};
  const doc = { readyState: 'loading', addEventListener() {}, querySelector() { throw new Error('Unexpected script load'); } };
  new Function('window', 'document', authSource)(win, doc);
  let error;
  try { await win.JayceeAuth.getSupabaseClient(); } catch (caught) { error = caught; }
  assert(error?.message.includes('Missing app configuration'), 'Missing configuration must fail before any network access');
};
