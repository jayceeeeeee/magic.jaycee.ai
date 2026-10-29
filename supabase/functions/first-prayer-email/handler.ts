type Config = {
  supabaseUrl: string;
  serviceRoleKey: string;
  webhookSecret: string;
  resendApiKey: string;
  from: string;
  to: string;
};

type PendingEmail = {
  user_id: string | null;
  prayer_id: string;
  delivery_started_at: string;
  sent_at: string | null;
  payload: { username: string; problem: string; prayer: string; created_at: string };
};

export function createHandler(config: Config, requestFetch: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    if (!config.webhookSecret || request.headers.get('x-prayer-webhook-secret') !== config.webhookSecret) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (Object.values(config).some((value) => !value)) {
      return new Response('Email configuration missing', { status: 503 });
    }
    let userId: string;
    let filter: string;
    try {
      const body = await request.json();
      userId = body.notification_id ?? body.user_id;
      filter = body.notification_id ? 'id' : 'user_id';
      if (typeof userId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(userId)) {
        return new Response('Invalid account', { status: 400 });
      }
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }
    const url = `${config.supabaseUrl}/rest/v1/first_prayer_emails?${filter}=eq.${userId}`;
    const headers = {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
    };
    const call = (input: string, init: RequestInit) => requestFetch(input, {
      ...init, signal: AbortSignal.timeout(10000),
    });
    try {
      const lookup = await call(`${url}&select=*`, { headers });
      if (!lookup.ok) throw new Error('Queue lookup failed');
      const [item]: PendingEmail[] = await lookup.json();
      if (!item || item.sent_at || !item.payload) return Response.json({ skipped: true });
      // Never replay outside the provider's idempotency window.
      const started = Date.parse(item.delivery_started_at);
      if (!Number.isFinite(started) || Date.now() - started >= 23 * 3600000) {
        return new Response('Delivery window expired; inspect manually', { status: 409 });
      }
      const sent = await call('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `first-prayer/${item.prayer_id}`,
        },
        body: JSON.stringify({
          from: config.from,
          to: [config.to],
          subject: item.user_id ? 'Magic — Première prière d’un nouveau compte' : 'Magic — Nouvelle prière avant inscription',
          text: [
            item.user_id ? 'Un compte vient d’envoyer sa première prière.' : 'Un visiteur vient d’envoyer une prière avant inscription.',
            `Nom : ${item.payload.username}`,
            `Compte : ${item.user_id || 'Visiteur sans compte'}`,
            `Date : ${item.payload.created_at}`,
            '', 'Problème :', item.payload.problem,
            '', 'Prière :', item.payload.prayer,
          ].join('\n'),
        }),
      });
      if (!sent.ok) throw new Error(`Resend returned ${sent.status}`);
      const receipt = await sent.json();
      if (typeof receipt.id !== 'string' || !receipt.id) throw new Error('Missing Resend receipt');
      const saved = await call(url, {
        method: 'PATCH', headers,
        body: JSON.stringify({ sent_at: new Date().toISOString() }),
      });
      if (!saved.ok) throw new Error('Email receipt could not be saved');
      return Response.json({ sent: true });
    } catch (error) {
      // Log no prayer, recipient, credential or provider response body.
      console.error('First prayer email failed:', error instanceof Error ? error.message : 'Unknown error');
      return new Response('Delivery failed; queued for retry', { status: 502 });
    }
  };
}
