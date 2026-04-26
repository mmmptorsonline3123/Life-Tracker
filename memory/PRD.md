# Aura — Personal AI Assistant (PRD)

## Overview
Aura is a multi-user personal AI assistant Expo mobile app that handles tasks, habits, expenses, health tracking, reminders, journaling, mood, and natural-language memory queries — all controllable by voice. Data syncs across devices via Gmail sign-in.

## Stack
- Backend: FastAPI + MongoDB (motor) + httpx
- Frontend: Expo SDK 54 + Expo Router (file-based)
- AI: Claude Sonnet 4.5 via emergentintegrations + EMERGENT_LLM_KEY
- Voice STT: OpenAI Whisper-1 via emergentintegrations + EMERGENT_LLM_KEY
- TTS: expo-speech (on-device, voice picker)
- Audio recording: expo-audio
- Auth: Emergent-managed Google OAuth (Gmail sign-up). Bearer session token + httpOnly cookie
- Storage: AsyncStorage for session_token + voice/wake-mode settings
- Currency: INR (₹)

## Screens (file-based routing)
1. `/login` — Hero login with "Continue with Google"
2. `/auth-callback` — Exchanges OAuth `session_id` for backend session_token
3. `/` — Home dashboard: live clock, daily stats grid, mood, streak, next reminder
4. `/tasks` — Tasks CRUD, priority badges, filters
5. `/habits` — 6 daily habits, ring progress, streak
6. `/expenses` — Daily total, list, INR amounts, category/payment tags
7. `/health` — Water glasses (0–8), calories vs 2200 kcal, workout toggle
8. `/reminders` — Upcoming/past tabs, presets, repeat (once/daily/weekly), in-app toast firing
9. `/journal` — Mood-tagged entries, free-write
10. `/calendar` — Month grid + per-day aggregated history view
11. `/ai` — Chat memory powered by Claude with full data context
12. `/settings` — Account info + sign-out, wake word toggle, TTS toggle, voice picker

## Bottom navigation tabs
Home · Tasks · Habits · Money · Health · Alerts · Journal · **Calendar** · Aura

## Voice
- Persistent ambient bar (mic, TTS toggle, settings gear). Hidden on /login, /auth-callback, /settings
- Tap mic for one-shot, long-press for hands-free
- "Hey Aura" wake-word mode (toggle in Settings) — continuously listens, ignores anything without wake word
- expo-speech voice picker in Settings
- Whisper-based STT
- Voice command parser handles ~18 patterns; unknown queries route to Claude memory

## Auth (Emergent-managed Google)
- Frontend: `window.location.href = https://auth.emergentagent.com/?redirect=...` on web; `WebBrowser.openAuthSessionAsync` on native
- Backend exchanges `session_id` → `session-data` from Emergent → stores user + 7-day session
- All API endpoints require `Authorization: Bearer <session_token>` (or session_token cookie)
- Per-user `user_id` UUID; data isolation verified via tests
- `/api/auth/me`, `/api/auth/logout` available

## Backend endpoints (all under /api)
- Auth: POST /auth/session, GET /auth/me, POST /auth/logout
- Tasks: POST/GET/PATCH/DELETE /tasks
- Habits: GET /habits/today, POST /habits/toggle
- Expenses: POST /expenses, GET /expenses, DELETE, GET /expenses/today/total
- Health: GET /health/today, POST /health/action
- Reminders: POST/GET/PATCH done/DELETE /reminders
- Journal: POST/GET/DELETE /journal
- Mood: POST /mood, GET /mood/today
- Dashboard: GET /dashboard
- **History (calendar)**: GET /history/{date}, GET /history/active-dates/{year_month}
- Chat: POST /chat, GET /chat/history (Claude with full memory context)
- Transcribe: POST /transcribe (Whisper)

## Calendar
- Month grid with prev/next buttons (capped at current month)
- Today highlighted in terracotta; selected day in primary green
- Dot indicator on every day with at least one record
- Future days disabled
- Selected day shows: summary chips (tasks/habits/money/water/workout/mood) + grouped sections for Tasks, Expenses, Habits done, Journal entries, Reminders

## Persistence
- MongoDB stores all data per user_id, indefinitely
- Frontend caches session token in AsyncStorage
- Voice settings cached in AsyncStorage (`aura_settings_v1`)

## Smart Business Enhancement
- Streak gamification + multi-device sync = retention engine
- Calendar surfaces cumulative history → reinforces "Aura remembers everything" value prop, increasing willingness to log more data

## Testing
- 33 backend pytest cases (auth, isolation, calendar history) — all passing
- 6 frontend mobile flows (390×844) — all passing
- See /app/auth_testing.md for auth-gated testing playbook
- See /app/memory/test_credentials.md for seeded session token
