import { createHandler } from "./server.ts";

const handler = createHandler(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
);
Deno.serve(handler);
