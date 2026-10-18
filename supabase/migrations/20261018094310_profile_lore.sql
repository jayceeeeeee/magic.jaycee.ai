-- Public character story, edited with the existing owner-only profile update policy.
alter table public.profiles
  add column lore text not null default '',
  add constraint profiles_lore_length check (char_length(lore) <= 20000);

notify pgrst, 'reload schema';
