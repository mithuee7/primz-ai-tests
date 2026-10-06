# Primz AI

Instagram DM conversation automation dashboard. You send the cold DM by hand. When a lead replies, you switch **Auto Chat** on for that one conversation. The AI continues the chat, a second AI checks every reply, and anything uncertain is held for you instead of being sent.

> **Instagram is not connected.** Nothing in this repo has been tested against the real Meta API. See [Connecting Instagram](#connecting-instagram).

## What's built

- Next.js 15 (App Router) + TypeScript (strict) + Tailwind + Zod + Lucide, Supabase for auth/DB, Groq for AI.
- **Pages:** Dashboard, Chats (list + DM-style conversation, mobile-first), Needs Review, Leads, Services, Settings, Login.
- **Per-chat controls:** Auto Chat toggle, Take Over, lead type, services (all or selected, stored as IDs), tone, extra instructions, read-only AI memory view.
- **Pipeline** (`src/lib/services/ai/pipeline.ts`): incoming message → conversation lookup → `auto_chat_enabled` check → last 20 messages + state + selected services → Conversation AI → schema validation → rule guards → Output Checker AI → deterministic cleanup → final validation → re-check live state → send via `InstagramService` → save message → update state.
- **Fail closed:** any error, malformed JSON, checker failure, low confidence, listed issue, or state change means nothing is sent and the chat is flagged `needs_review`.
- **Server-side enforcement:** Take Over / Auto Chat are enforced in the pipeline (re-checked immediately before every send), not just in the UI. A per-conversation lock prevents double replies.
- **Audit trail:** `ai_generations` (what the model wrote) is separate from `messages` (what was sent); `ai_reviews` holds rule, AI and manual reviews.
- **Safety extras:** prompt-injection phrases from a lead and "are you a bot?" questions are escalated to a human and never auto-answered.
- **Cleanup** (`src/lib/text/cleanup.ts`): separator dashes become `, `; `follow-up`, `AI-powered`, `co-ordinate` and numeric ranges are untouched. Unit tested.

## Run it (demo mode, no accounts needed)

```bash
npm install
cp .env.example .env.local     # DEMO_MODE=true is the default
npm run dev                    # http://localhost:3000
```

Demo mode seeds four chats (dentist, real estate, UGC creator, local business) at different stages, uses in-memory data (resets on restart), and a mock Instagram. A yellow banner shows whenever demo mode is on.

With no Groq key, demo mode uses a **scripted stand-in** (`src/lib/services/llm/demo.ts`). It is keyword rules, not an AI. Add a Groq key (in Settings) to use the real models.

In a chat, open the sliders icon → **Demo tools** to simulate lead messages, force a bad draft to watch the checker reject it, and reset data.

```bash
npm test          # 52 unit/pipeline tests
npm run typecheck
npm run build
```

## Environment variables

Only the Supabase connection lives in environment variables. Groq and Instagram details are entered in **Settings** and stored encrypted in your database.

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | for real use | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | for real use | Used for auth only. |
| `SUPABASE_SERVICE_ROLE_KEY` | for real use | **Server only.** Also used to derive the key that encrypts saved secrets. |
| `NODE_VERSION` | on Render | `22` |
| `DEMO_MODE` | no | `true` forces demo. Also on automatically if Supabase vars are missing. |
| `GROQ_API_KEY` | no | Fallback if you didn't save a key in Settings. |
| `APP_ENCRYPTION_KEY` | no | Overrides the encryption key. Changing either key makes saved secrets unreadable; paste them again. |
| `CHECKER_MIN_CONFIDENCE` | no | Default 0.85. Editable in Settings. |

## Database setup

1. Create a Supabase project.
2. Run `supabase/migrations/0001_init.sql`, then `supabase/migrations/0002_instagram_and_idempotency.sql` in the SQL editor. **0002 is required**: it adds the Instagram settings columns and the `reply_claims` table the one-reply-per-message guarantee depends on. Without it, replies fail closed (nothing is sent).
3. Set the three Supabase env vars, `DEMO_MODE=false`, redeploy.
4. Create an account on `/login`.

RLS restricts every table to `owner_id = auth.uid()`. `app_settings` has no policies on purpose (service role only). The server also scopes every query by `owner_id`.

## Connecting Instagram

1. In Settings -> Instagram connection, paste the Instagram access token and the Instagram app secret, then **Connect & verify**. The app checks the token with Instagram, upgrades it to a long-lived one when it can, shows the @username and days left.
2. Copy the **Callback URL** and **Verify token** shown there into Meta (Instagram -> Webhooks) and subscribe to `messages`.
3. Test with a second Instagram account that has a role on your Meta app.

Tokens last ~60 days. The app refreshes the token automatically once 20 or fewer days remain (and there is a "Refresh token now" button). Refresh runs when the app handles a page load or webhook, so if nobody uses the app for 60 days the token can still expire; paste a new one then.

## One reply per message

Meta re-sends a webhook if it isn't answered quickly. Protection, in layers:

1. The webhook stores each message under its Instagram message id (unique per account) and returns 200 right away. Redeliveries of the same id are dropped.
2. Profile lookup, history backfill and the AI run happen after the response.
3. Before generating anything, the pipeline claims the inbound message id in `reply_claims` (primary key = message id). Only one run can ever hold a claim, even across server instances.
4. A claim that is SENT, PROCESSING or UNKNOWN is never retaken. Only "nothing was sent" outcomes (aborted, or held for review/failed when a person presses Run AI now) can be retaken.
5. If a send times out or returns 5xx, delivery is unknown. The app does NOT retry; it marks the claim UNKNOWN and flags the chat so you check Instagram.
6. A run that dies mid-way leaves a stale PROCESSING claim; it is swept to SENT (if our reply is stored) or UNKNOWN + flagged.
7. A throttled recovery picks up lead messages left unanswered for 90s-30min (auto chat on), also guarded by the claim.

Result: at most one reply per inbound message. The cost is that in a rare ambiguous failure the AI stays silent and asks a human, rather than risk a duplicate.

## What is mocked

| Piece | Status |
|---|---|
| Instagram in demo mode | `MockInstagramService`. Nothing is delivered. |
| Instagram live | Send, profile, history, token connect/refresh and webhook are implemented but **not tested against a live Instagram account** here. |
| AI without a key (demo only) | Scripted `DemoLLM`, clearly labelled. |

## Known limitations

- **Untested against live services:** Groq calls, the Supabase repository, and Meta have not been run against the real things in this environment (no keys). The in-memory path, pipeline logic and UI are tested.
- Rate limiting is in-memory per process; use a shared store (Redis/Supabase) on serverless or multi-instance hosting.
- The webhook finds the owner by Instagram account id, so several users can each connect their own account.
- Render free tier sleeps; the first webhook after a sleep may be slow and Meta will retry (safe, deduplicated).
- Meta may restrict messaging people without a role on your app until the app passes review.
- The chat view polls every 6 seconds rather than using realtime subscriptions.
- Service seed data comes from what primz-ai.onrender.com says publicly, which is brief. **Review and edit it on the Services page**; the AI treats those rows as its only source of truth.
- Webhook processing runs after the response via `after()`; on hosts that cut work off after responding, move it to a queue.
- Text/DM only: attachments, reactions and read receipts are ignored.
- The checker is an LLM and can be wrong. The deterministic rules and "approve only if confidence ≥ threshold and no issues" logic reduce risk but do not remove it; review early conversations before trusting Auto Chat broadly.
