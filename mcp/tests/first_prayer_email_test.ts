import { createHandler } from '../../supabase/functions/first-prayer-email/handler.ts';

const config = {
  supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'service-key',
  webhookSecret: 'webhook-secret', resendApiKey: 'resend-key',
  from: 'Magic <notifications@example.com>', to: 'owner@example.com',
};
const userId = '11111111-1111-4111-8111-111111111111';
const item = () => ({
  user_id: userId, prayer_id: '22222222-2222-4222-8222-222222222222',
  delivery_started_at: new Date().toISOString(), sent_at: null,
  payload: { username: '<User>', problem: 'Help me', prayer: 'Thank you', created_at: '2026-10-29' },
});
const request = (secret = config.webhookSecret, body: unknown = { user_id: userId }) => new Request('https://example.test', {
  method: 'POST', headers: { 'x-prayer-webhook-secret': secret }, body: JSON.stringify(body),
});
const assert = (ok: unknown) => { if (!ok) throw new Error('Assertion failed'); };

Deno.test('rejects unauthorized, malformed and unconfigured calls without network access', async () => {
  const noFetch = (() => { throw new Error('Unexpected network call'); }) as typeof fetch;
  const handler = createHandler(config, noFetch);
  assert((await handler(request('wrong'))).status === 401);
  assert((await handler(request(undefined, { user_id: null }))).status === 400);
  assert((await handler(new Request('https://example.test'))).status === 405);
  assert((await createHandler({ ...config, resendApiKey: '' }, noFetch)(request())).status === 503);
});

Deno.test('uses stored content, fixed destination and stable idempotency key; records acceptance', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const mockFetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (calls.length === 1) return Promise.resolve(Response.json([item()]));
    if (calls.length === 2) return Promise.resolve(Response.json({ id: 'email-id' }));
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as typeof fetch;
  assert((await createHandler(config, mockFetch)(request(undefined, { user_id: userId, to: 'attacker@example.com' }))).status === 200);
  assert(calls.length === 3);
  const email = JSON.parse(String(calls[1].init.body));
  assert(email.to[0] === config.to && email.text.includes('<User>'));
  assert(!('html' in email));
  assert(new Headers(calls[1].init.headers).get('Idempotency-Key') === `first-prayer/${item().prayer_id}`);
  assert(calls[2].init.method === 'PATCH' && JSON.parse(String(calls[2].init.body)).sent_at);
});

Deno.test('skips already sent, absent, historical and expired entries', async () => {
  for (const row of [undefined, { ...item(), sent_at: '2026-10-29' }, { ...item(), payload: null },
    { ...item(), delivery_started_at: new Date(Date.now() - 24 * 3600000).toISOString() }]) {
    let calls = 0;
    const mockFetch = (() => {
      calls++;
      return Promise.resolve(Response.json(row ? [row] : []));
    }) as typeof fetch;
    await createHandler(config, mockFetch)(request());
    assert(calls === 1);
  }
});

Deno.test('provider failure leaves queue pending; receipt failure retries with the same key', async () => {
  for (const failure of ['provider', 'receipt']) {
    let calls = 0;
    const mockFetch = (() => {
      calls++;
      if (calls === 1) return Promise.resolve(Response.json([item()]));
      if (calls === 2 && failure === 'receipt') return Promise.resolve(Response.json({ id: 'email-id' }));
      return Promise.resolve(new Response('Unavailable', { status: 503 }));
    }) as typeof fetch;
    assert((await createHandler(config, mockFetch)(request())).status === 502);
    assert(calls === (failure === 'provider' ? 2 : 3));
  }
});

Deno.test('anonymous notification uses its queue ID and explains the pre-signup submission', async () => {
  const notificationId = '33333333-3333-4333-8333-333333333333';
  const calls: { url: string; init: RequestInit }[] = [];
  const mockFetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (calls.length === 1) return Promise.resolve(Response.json([{ ...item(), user_id: null }]));
    if (calls.length === 2) return Promise.resolve(Response.json({ id: 'email-id' }));
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as typeof fetch;
  const response = await createHandler(config, mockFetch)(request(undefined, { notification_id: notificationId }));
  assert(response.status === 200);
  assert(calls[0].url.includes(`?id=eq.${notificationId}`));
  const email = JSON.parse(String(calls[1].init.body));
  assert(email.subject.includes('avant inscription') && email.text.includes('Visiteur sans compte'));
  assert(calls[2].url.includes(`?id=eq.${notificationId}`));
});

Deno.test('signup uses its dedicated queue, email address and stable account idempotency key', async () => {
  const signupId = '44444444-4444-4444-8444-444444444444';
  const calls: { url: string; init: RequestInit }[] = [];
  const mockFetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (calls.length === 1) return Promise.resolve(Response.json([{
      ...item(), prayer_id: undefined,
      payload: { email: 'new@example.com', username: '', created_at: '2026-10-29' },
    }]));
    if (calls.length === 2) return Promise.resolve(Response.json({ id: 'signup-email-id' }));
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as typeof fetch;
  const response = await createHandler(config, mockFetch)(request(undefined, { signup_id: signupId }));
  assert(response.status === 200);
  assert(calls[0].url.includes(`/signup_emails?id=eq.${signupId}`));
  const email = JSON.parse(String(calls[1].init.body));
  assert(email.subject === 'Magic — Nouvelle inscription');
  assert(email.text.includes('new@example.com') && email.text.includes('Non renseigné'));
  assert(!email.text.includes('Prière :'));
  assert(new Headers(calls[1].init.headers).get('Idempotency-Key') === `signup/${userId}`);
  assert(calls[2].url.includes(`/signup_emails?id=eq.${signupId}`));
});
