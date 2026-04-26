# Aura — Personal AI Assistant (PRD)

## Overview
Aura is a multi-user personal AI assistant Expo mobile app that handles tasks, habits, expenses, health tracking, reminders, journaling, mood, and natural-language memory queries — all controllable by voice. Data syncs across devices via Gmail sign-in.

## Stack
- Backend: FastAPI + MongoDB (motor) + httpx
- Frontend: Expo SDK 54 + Expo Router (file-based)
- AI: Claude Sonnet 4.5 via emergentintegrations + EMERGENT_LLM_KEY
- Voice STT: OpenAI Whisper-1 via emergentintegrations + EMERGENT_LLM_KEY
- TTS: OpenAI TTS-1 via emergentintegrations + EMERGENT_LLM_KEY (backend-driven, non-robotic)
- Audio recording: expo-audio
- Audio upload: expo-file-system `readAsStringAsync + EncodingType.Base64` → JSON body `{audio_b64, format}` (definitively fixes all multipart 422 errors on native)
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
Home · Tasks · Habits · Money · Health · Alerts · Journal · Calendar · Aura

## Voice
- Persistent ambient bar (mic, TTS toggle, settings gear). Hidden on /login, /auth-callback, /settings
- Tap mic for one-shot, long-press for hands-free
- "Hey Aura" wake-word mode (toggle in Settings)
- OpenAI TTS voices: Nova, Shimmer, Coral, Sage, Alloy, Echo, Fable, Onyx, Ash
- Whisper-based STT via FileSystem.uploadAsync (fixes 422 error on native)
- Voice command parser handles ~18 patterns; unknown queries route to Claude memory

## Auth (Emergent-managed Google)
- Frontend: WebBrowser.openAuthSessionAsync on native
- Backend exchanges session_id -> session-data from Emergent -> stores user + 7-day session
- All API endpoints require Authorization: Bearer <session_token>
- Per-user user_id UUID; data isolation enforced

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
- History (calendar): GET /history/{date}, GET /history/active-dates/{year_month}
- Chat: POST /chat, GET /chat/history
- Transcribe: POST /transcribe (Whisper, multipart/form-data)
- TTS: POST /tts (OpenAI TTS-1, returns audio_b64)

## Testing (Iteration 5 — Feb 2026)
- 19/19 backend tests for morning-brief — all passing (100%)
- All frontend code checks passing (100%)
- Claude-confirmed: `GET /api/morning-brief` returns real personalized briefing via claude-sonnet-4-5-20250929
- MongoDB day-caching confirmed (2nd call returns cached brief)
- MorningBriefCard: renders 7 AM–12 PM only, dismiss/play buttons verified
- All minor issues (user_id leak in cache, DIMISS_KEY typo) fixed

## Backlog
### P1 (Near-term)
- Test "Hey Aura" continuous listening on real physical device with Expo Go

### P2 (Medium-term)
- Mood trend chart in Insights screen
- Smart suggestions from AI based on patterns

### P3 (Future)
- Export journal as PDF
- Share calendar with partner
- Offline caching via AsyncStorage
- Push notification delivery for reminders
