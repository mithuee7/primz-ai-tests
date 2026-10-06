-- Stores the Instagram (Meta) connection inside the app instead of server env vars.
-- Run once in the Supabase SQL editor, AFTER 0001_init.sql.
-- Tokens/secrets are AES-256-GCM ciphertext written by the server only.
-- app_settings has RLS enabled with no policies, so only the service role can read it.

alter table public.app_settings
  add column if not exists meta_ig_account_id text,
  add column if not exists meta_ig_scoped_id text,
  add column if not exists meta_ig_username text,
  add column if not exists meta_token_encrypted text,
  add column if not exists meta_token_expires_at timestamptz,
  add column if not exists meta_token_refreshed_at timestamptz,
  add column if not exists meta_app_secret_encrypted text,
  add column if not exists meta_verify_token text;

-- Used by the webhook to find which user an incoming event belongs to.
create unique index if not exists app_settings_meta_ig_account_uniq
  on public.app_settings (meta_ig_account_id) where meta_ig_account_id is not null;
create index if not exists app_settings_meta_scoped_idx
  on public.app_settings (meta_ig_scoped_id) where meta_ig_scoped_id is not null;
create index if not exists app_settings_meta_verify_idx
  on public.app_settings (meta_verify_token) where meta_verify_token is not null;

-- ---------------------------------------------------------------------------
-- Exactly-once replies. Meta retries webhooks that look slow or failed; this table makes sure
-- each inbound message can be answered by AT MOST ONE run. trigger_message_id is the primary
-- key, so two concurrent runs (or two servers) can't both claim the same message.
-- ---------------------------------------------------------------------------
create table if not exists public.reply_claims (
  trigger_message_id uuid primary key references public.messages (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  status text not null default 'PROCESSING'
    check (status in ('PROCESSING', 'SENT', 'REVIEW', 'FAILED', 'ABORTED', 'UNKNOWN')),
  generation_id uuid references public.ai_generations (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reply_claims_owner_status_idx on public.reply_claims (owner_id, status, updated_at);
create index if not exists reply_claims_conversation_idx on public.reply_claims (conversation_id);

alter table public.reply_claims enable row level security;
create policy "owner select" on public.reply_claims for select using (owner_id = auth.uid());
