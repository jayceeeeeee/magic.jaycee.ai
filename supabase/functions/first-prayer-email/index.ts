import { createHandler } from './handler.ts';

const config = {
  supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  resendApiKey: Deno.env.get('RESEND_API_KEY') || '',
  from: Deno.env.get('PRAYER_NOTIFICATION_FROM') || '',
  to: Deno.env.get('PRAYER_NOTIFICATION_TO') || '',
};

// The database owns the internal webhook secret. Only service_role can read it.
let webhookSecret = '';
Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!webhookSecret) {
    try {
      const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/get_first_prayer_webhook_secret`, {
        method: 'POST',
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Webhook configuration unavailable');
      const secret = await response.json();
      if (typeof secret !== 'string' || secret.length < 32) throw new Error('Webhook configuration missing');
      webhookSecret = secret;
    } catch {
      return new Response('Webhook configuration unavailable', { status: 503 });
    }
  }
  return createHandler({ ...config, webhookSecret })(request);
});
