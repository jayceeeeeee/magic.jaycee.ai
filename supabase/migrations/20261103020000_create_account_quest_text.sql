-- Rename the guest quest prompt while preserving its action and other content.
update public.notifications
set content = jsonb_set(
  content,
  '{text}',
  to_jsonb(replace(content->>'text', 'Unlock Level 2:', 'Create your account:'))
)
where id = 'create_account.v1'
  and content->>'text' like 'Unlock Level 2:%';
