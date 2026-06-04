-- Web-chat conversation logging — powers the Conversations dashboard analytics.
-- The website chatbot (api/chat.js) was stateless; this captures each exchange.
-- PII-bearing (visitor messages). Admin-only reads via RLS; writes come from the
-- service role (api/chat.js), which bypasses RLS.

create table if not exists chat_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null,
  channel     text not null default 'web',   -- 'web' | future channels
  role        text not null check (role in ('user','assistant')),
  content     text,
  created_at  timestamptz not null default now()
);

create index if not exists chat_messages_session_idx on chat_messages (session_id);
create index if not exists chat_messages_created_idx on chat_messages (created_at desc);

alter table chat_messages enable row level security;

drop policy if exists "admin_read_chat_messages" on chat_messages;
create policy "admin_read_chat_messages" on chat_messages for select using (is_admin());
