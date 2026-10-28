import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const ACCOUNT_RESOURCE = "ui://magic/account-v2.html";
const fields = "id,username,full_name,avatar_path,master,birth_date,birth_time,manna_target,manna_unit,manna_cycle,lore,visibility,permanent_account_at";
const skillSchema = z.object({ label: z.string().trim().max(120), description: z.string().trim().max(20000) }).strict();
const profileSchema = z.object({
  username: z.string().trim().max(100).nullable().optional(),
  full_name: z.string().trim().max(1000).nullable().optional(),
  birth_date: z.string().nullable().optional(),
  birth_time: z.string().nullable().optional(),
  manna_target: z.number().finite().optional(),
  manna_unit: z.string().regex(/^[A-Z]{3}$/).optional(),
  manna_cycle: z.enum(["year", "month", "day", "hour"]).optional(),
  lore: z.string().trim().max(20000).optional(),
  visibility: z.boolean().optional(),
  avatar_path: z.string().regex(/^avatar-[0-9a-f-]{36}\.(png|jpg|webp|gif)$/).optional(),
}).strict();
const imageTypes: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const maxImageBytes = 5 * 1024 * 1024;

export function registerAccountTools(server: McpServer, { client, userId, withProfileImageUrls, siteOrigin = "http://localhost:3000" }: {
  client: SupabaseClient;
  userId: string;
  withProfileImageUrls: (row: Record<string, any>) => Promise<any>;
  siteOrigin?: string;
}) {
  const siteUrl = new URL(Deno.env.get("MCP_SITE_URL") || siteOrigin);
  if (siteOrigin === "https://magic.jaycee.ai" && siteUrl.origin !== siteOrigin) {
    throw new Error("Production MCP_SITE_URL must use https://magic.jaycee.ai.");
  }
  const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  const write = { ...read, readOnlyHint: false, idempotentHint: true };
  const meta = { securitySchemes: [{ type: "oauth2", scopes: ["profile"] }] };
  const guarded = (fn: (args: any) => Promise<any>) => async (args: any) => {
    try {
      const value = await fn(args);
      return { structuredContent: value, content: [{ type: "text" as const, text: JSON.stringify(value) }] };
    } catch (error: any) {
      return { isError: true, content: [{ type: "text" as const, text: error?.code === "23505" ? "That username is already in use." : error?.message || "Account operation failed." }] };
    }
  };
  const ownProfile = async () => {
    const { data, error } = await client.from("profiles").select(fields).eq("id", userId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Your account profile is unavailable.");
    return data;
  };
  const players = async () => {
    const { data, error } = await client.from("player").select("id,user_id,master,level").eq("user_id", userId).order("level", { ascending: false }).limit(1);
    if (error) throw error;
    return data || [];
  };
  const ownSkills = async () => {
    const { data: game, error } = await client.from("game").select("id,user_id,skill_0,skill_1,skill_2,skill_3,skill_4").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    const ids = Array.from({ length: 5 }, (_, i) => game?.[`skill_${i}` as keyof typeof game]).filter(Boolean);
    const found = ids.length ? await client.from("skills").select("id,label,description").in("id", ids) : { data: [], error: null };
    if (found.error) throw found.error;
    const skills = Array.from({ length: 5 }, (_, index) => {
      const skill = found.data?.find((row: any) => row.id === game?.[`skill_${index}` as keyof typeof game]);
      return { id: skill?.id || null, label: skill?.label || "", description: skill?.description || "" };
    });
    return { game, skills };
  };
  const accountLevel = async (profile: any) => Math.max(profile.permanent_account_at ? 4 : 0, ...(await players()).map((row: any) => Number(row.level) || 0));
  const access = async () => {
    const { data, error } = await client.rpc("check_account_access");
    if (error) throw error;
    if (data?.locked) throw new Error("Your account is locked. Contact support.");
  };
  const state = async () => {
    const [profile, participation, authored] = await Promise.all([ownProfile(), players(), ownSkills()]);
    let master = null;
    if (profile.master) {
      const fetched = await client.from("profiles").select("id,username,full_name,avatar_path").eq("id", profile.master).maybeSingle();
      if (fetched.error) throw fetched.error;
      master = fetched.data ? await withProfileImageUrls(fetched.data) : null;
    }
    const level = Math.max(profile.permanent_account_at ? 4 : 0, ...participation.map((row: any) => Number(row.level) || 0));
    return { kind: "account_state", retrieved_at: new Date().toISOString(), profile: await withProfileImageUrls(profile), players: participation, master, ...authored,
      access: { level, map: level >= 2, skills: level >= 3, ultimate: level >= 4, visibility: level >= 4 },
      referral_url: profile.username ? new URL(`/?ref=${encodeURIComponent(profile.username)}`, siteUrl).href : null };
  };
  for (const name of ["get_account_state", "show_account"]) server.registerTool(name, {
    title: name === "show_account" ? "Account settings" : "Read account settings",
    description: name === "show_account" ? "Open the separate Account panel: profile, photo, Map/Manna, lore, own skills, visibility and referral link, with the same level unlocks as the website. Use show_game for playing." : "Read your saved Account panel settings, own five skill slots and level unlocks. No UI. Use update_account_profile and save_account_skills to edit through chat.",
    inputSchema: {}, annotations: read,
    _meta: name === "show_account" ? { ...meta, ui: { resourceUri: ACCOUNT_RESOURCE } } : meta,
  }, guarded(state));

  server.registerTool("update_account_profile", {
    title: "Update account settings", description: "Patch only supplied Account fields. Character: username/full_name. Level 2: birth_date (YYYY-MM-DD), birth_time (HH:mm), manna_target/unit/cycle. Level 3: lore. Level 4: visibility (publishing requires a username and all five named skills). avatar_path only accepts a photo already uploaded in your Account interface. Cannot change email, password, Master, progression or permanent status. Returns fresh saved account state.",
    inputSchema: { updates: profileSchema }, annotations: write, _meta: meta,
  }, guarded(async ({ updates }) => {
    const patch = profileSchema.parse(updates);
    if (!Object.keys(patch).length) throw new Error("Supply at least one field to update.");
    await access();
    const profile = await ownProfile();
    const level = await accountLevel(profile);
    if (["birth_date", "birth_time", "manna_target", "manna_unit", "manna_cycle"].some((key) => key in patch) && level < 2) throw new Error("Reach Level 2 to edit your Map.");
    if (patch.lore !== undefined && level < 3) throw new Error("Reach Level 3 to edit your lore.");
    if (patch.visibility !== undefined && level < 4) throw new Error("Reach Level 4 to change account visibility.");
    for (const key of ["username", "full_name"] as const) if (patch[key] === "") patch[key] = null;
    if (patch.birth_date) {
      const date = new Date(`${patch.birth_date}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.birth_date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== patch.birth_date || patch.birth_date > new Date().toISOString().slice(0, 10)) throw new Error("Enter a valid birth date.");
    }
    if (patch.birth_time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(patch.birth_time)) throw new Error("Enter a valid birth time.");
    if (patch.avatar_path) {
      const { data, error } = await client.storage.from("users").info(`${userId}/${patch.avatar_path}`);
      if (error || !data) throw new Error("Upload your photo before saving it.");
      if (!imageTypes[data.contentType || ""] || !Number.isFinite(data.size) || Number(data.size) <= 0 || Number(data.size) > maxImageBytes) throw new Error("Choose a PNG, JPEG, WebP or GIF photo up to 5 MB.");
    }
    if (patch.visibility === true) {
      const username = patch.username === undefined ? profile.username : patch.username;
      if (!username || (await ownSkills()).skills.some((skill) => !skill.label.trim())) throw new Error("Choose a username and name all five skills before making your account visible.");
    }
    const { data, error } = await client.from("profiles").update(patch).eq("id", userId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Account was not saved. Reload and try again.");
    return await state();
  }));

  server.registerTool("save_account_skills", {
    title: "Save your own skills", description: "Save the five ordered skill slots of your own game: Passive, Skill 1, Skill 2, Skill 3, Ultimate. Reach Level 3 first; the Ultimate is editable only at Level 4. Read get_account_state first and preserve slots the user did not ask to change. This edits authored skills, not practice or another Master's game.",
    inputSchema: { skills: z.array(skillSchema).length(5) }, annotations: write, _meta: meta,
  }, guarded(async ({ skills }) => {
    const values = z.array(skillSchema).length(5).parse(skills);
    await access();
    const level = await accountLevel(await ownProfile());
    if (level < 3) throw new Error("Reach Level 3 to create your game.");
    if (values.some((skill) => skill.description && !skill.label)) throw new Error("Add a name for each skill that has a description.");
    if (level < 4) {
      const ultimate = (await ownSkills()).skills[4];
      if (values[4].label !== ultimate.label.trim() || values[4].description !== ultimate.description.trim()) throw new Error("Reach Level 4 to edit your Ultimate.");
    }
    const { error } = await client.rpc("save_own_game", { p_skills: values });
    if (error) throw error;
    return await state();
  }));

  server.registerTool("prepare_account_avatar_upload", {
    title: "Prepare account photo upload", description: "Create a one-file upload URL for a photo explicitly selected in the Account interface. Upload directly using PUT, then save the returned avatar_path with update_account_profile. No account token is sent to the interface.",
    inputSchema: { content_type: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]), size: z.number().int().positive().max(maxImageBytes) },
    annotations: { ...write, idempotentHint: false }, _meta: { ...meta, ui: { visibility: ["app"] } },
  }, guarded(async ({ content_type, size }) => {
    if (!imageTypes[content_type] || size <= 0 || size > maxImageBytes) throw new Error("Choose a PNG, JPEG, WebP or GIF photo up to 5 MB.");
    await access();
    await ownProfile();
    const avatar_path = `avatar-${crypto.randomUUID()}.${imageTypes[content_type]}`;
    const { data, error } = await client.storage.from("users").createSignedUploadUrl(`${userId}/${avatar_path}`);
    if (error || !data?.signedUrl) throw error || new Error("Photo upload unavailable.");
    return { avatar_path, upload_url: data.signedUrl };
  }));
}
