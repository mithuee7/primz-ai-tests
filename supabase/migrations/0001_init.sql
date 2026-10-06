-- Primz AI schema. Run in the Supabase SQL editor (or `supabase db push`).
-- All tables carry owner_id so RLS can be a simple `owner_id = auth.uid()`.
-- The app server uses the service-role key and ALSO scopes every query by owner_id.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- services
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text not null default '',
  ideal_customer text not null default '',
  problems_solved text not null default '',
  key_benefits text not null default '',
  pitch_guidance text not null default '',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists services_owner_idx on public.services (owner_id, sort_order);

-- ----------------------------------------------------------- conversations
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  external_thread_id text not null,
  lead_external_id text,
  lead_name text not null,
  lead_username text not null,
  lead_avatar_url text,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_sender text check (last_message_sender in ('me', 'lead', 'ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, external_thread_id)
);
create index if not exists conversations_owner_recent_idx
  on public.conversations (owner_id, last_message_at desc nulls last);

create table if not exists public.conversation_settings (
  conversation_id uuid primary key references public.conversations (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  lead_type text not null default 'other'
    check (lead_type in ('doctor', 'real_estate', 'ugc_creator', 'creator', 'local_business', 'other')),
  tone text not null default 'casual'
    check (tone in ('casual', 'friendly', 'professional', 'confident', 'direct', 'custom')),
  custom_tone text,
  extra_instructions text not null default '',
  all_services boolean not null default true,
  auto_chat_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists conversation_settings_owner_auto_idx
  on public.conversation_settings (owner_id, auto_chat_enabled);

create table if not exists public.conversation_state (
  conversation_id uuid primary key references public.conversations (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  current_topic text,
  identified_problem text,
  potential_service_id uuid references public.services (id) on delete set null,
  interest_level text not null default 'UNKNOWN'
    check (interest_level in ('UNKNOWN', 'NONE', 'LOW', 'MEDIUM', 'HIGH')),
  conversation_stage text not null default 'DISCOVERY'
    check (conversation_stage in ('DISCOVERY', 'RAPPORT', 'PROBLEM_IDENTIFIED', 'SERVICE_FIT',
      'PITCHED', 'OBJECTION', 'INTERESTED', 'NOT_INTERESTED', 'HUMAN_TAKEOVER')),
  pitch_status text not null default 'NOT_PITCHED' check (pitch_status in ('NOT_PITCHED', 'PITCHED')),
  objection text,
  last_ai_message text,
  needs_review boolean not null default false,
  review_reason text,
  pending_generation_id uuid,
  lock_until timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists conversation_state_owner_review_idx
  on public.conversation_state (owner_id, needs_review);
create index if not exists conversation_state_owner_stage_idx
  on public.conversation_state (owner_id, conversation_stage);

-- Selected services per conversation (stored as IDs, never hardcoded into prompts).
create table if not exists public.conversation_services (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  primary key (conversation_id, service_id)
);

-- ---------------------------------------------------------------- messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  external_message_id text,
  sender_type text not null check (sender_type in ('me', 'lead', 'ai')),
  sender_name text,
  content text not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists messages_conversation_recent_idx
  on public.messages (conversation_id, created_at desc);
-- Duplicate webhook / duplicate message protection.
create unique index if not exists messages_external_id_uniq
  on public.messages (owner_id, external_message_id) where external_message_id is not null;

-- ------------------------------------------------------ AI audit trail
-- What the model GENERATED (may never be sent) vs what was actually sent (messages).
create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  generated_text text,
  model text not null,
  prompt_version text not null,
  status text not null default 'PENDING_REVIEW'
    check (status in ('PENDING_REVIEW', 'SENT', 'APPROVED_MANUALLY', 'DISCARDED', 'REJECTED', 'ABORTED', 'FAILED')),
  error text,
  state_update jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_generations_conversation_idx
  on public.ai_generations (conversation_id, created_at desc);
create index if not exists ai_generations_owner_status_idx
  on public.ai_generations (owner_id, status, created_at desc);

create table if not exists public.ai_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  generation_id uuid not null references public.ai_generations (id) on delete cascade,
  reviewer text not null default 'ai' check (reviewer in ('rules', 'ai', 'manual')),
  approved boolean not null,
  confidence numeric(4, 3) not null default 0,
  issues text[] not null default '{}',
  reason text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ai_reviews_generation_idx on public.ai_reviews (generation_id);

-- ------------------------------------------------------------ app settings
-- groq_key_encrypted is AES-256-GCM ciphertext written by the server only.
-- No RLS policies are defined for this table on purpose: only the service role can touch it.
create table if not exists public.app_settings (
  owner_id uuid primary key references public.profiles (id) on delete cascade,
  default_tone text not null default 'casual',
  default_custom_tone text,
  default_ai_behavior text not null default '',
  global_instructions text not null default '',
  groq_model text not null default 'llama-3.3-70b-versatile',
  checker_model text not null default 'llama-3.3-70b-versatile',
  checker_min_confidence numeric(3, 2) not null default 0.85,
  groq_key_encrypted text,
  groq_key_last4 text,
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_settings enable row level security;
alter table public.conversation_state enable row level security;
alter table public.conversation_services enable row level security;
alter table public.messages enable row level security;
alter table public.ai_generations enable row level security;
alter table public.ai_reviews enable row level security;
alter table public.app_settings enable row level security; -- no policies: service role only

create policy "own profile" on public.profiles for select using (id = auth.uid());
create policy "own profile update" on public.profiles for update using (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['services', 'conversations', 'conversation_settings', 'conversation_state',
                           'conversation_services', 'messages', 'ai_generations', 'ai_reviews']
  loop
    execute format('create policy "owner select" on public.%I for select using (owner_id = auth.uid())', t);
    execute format('create policy "owner insert" on public.%I for insert with check (owner_id = auth.uid())', t);
    execute format('create policy "owner update" on public.%I for update using (owner_id = auth.uid())', t);
    execute format('create policy "owner delete" on public.%I for delete using (owner_id = auth.uid())', t);
  end loop;
end $$;
