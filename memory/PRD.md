# Aura — Personal AI Assistant (PRD)

## Overview
Aura is a single-user personal AI assistant Expo mobile app that handles tasks, habits, expenses, health tracking, reminders, journaling, and natural-language memory queries — all controllable by voice.

## Stack
- Backend: FastAPI + MongoDB (motor)
- Frontend: Expo SDK 54 + Expo Router (file-based)
- AI: Claude Sonnet 4.5 via emergentintegrations + EMERGENT_LLM_KEY
- Voice STT: OpenAI Whisper-1 via emergentintegrations + EMERGENT_LLM_KEY
- TTS: expo-speech (on-device)
- Audio recording: expo-audio (`useAudioRecorder` + `RecordingPresets.HIGH_QUALITY`)
- Currency: INR (₹)

## Screens (8 total, file-based routing)
1. `/` — Home dashboard: live clock, daily stats grid, mood, streak, next reminder
2. `/tasks` — Tasks CRUD, priority badges, filters
3. `/habits` — 6 daily habits, ring progress, streak
4. `/expenses` — Daily total, list, INR amounts, category/payment tags
5. `/health` — Water glasses (0–8), calories vs 2200 kcal, workout toggle
6. `/reminders` — Upcoming/past tabs, presets, repeat (once/daily/weekly), in-app toast firing
7. `/journal` — Mood-tagged entries, free-write
8. `/ai` — Chat memory powered by Claude with full data context

## Voice
- Persistent ambient bar at top (one-shot mic by tap, hands-free by long-press)
- Whisper transcribes audio recorded via expo-audio
- `parseCommand()` handles: navigate, add task, mark habit done, log water, calories, workout, expense, mood, reminder (with relative/preset times), journal, status, turn-off-voice, and arbitrary memory queries
- TTS confirms every action; toggle via speaker icon in ambient bar
- "What's my status" speaks a full daily summary
- Memory queries route to /api/chat (Claude with full user data context)

## Backend endpoints (all under /api)
- Tasks: POST /tasks, GET /tasks?filter=, PATCH /tasks/{id}/toggle, DELETE /tasks/{id}
- Habits: GET /habits/today, POST /habits/toggle
- Expenses: POST /expenses, GET /expenses, DELETE /expenses/{id}, GET /expenses/today/total
- Health: GET /health/today, POST /health/action (water_inc/dec, calorie_add/sub, workout_toggle)
- Reminders: POST /reminders, GET /reminders, PATCH /reminders/{id}/done, DELETE /reminders/{id}
- Journal: POST /journal, GET /journal, DELETE /journal/{id}
- Mood: POST /mood, GET /mood/today
- Dashboard: GET /dashboard (aggregated stats)
- Chat: POST /chat, GET /chat/history (Claude with full memory context)
- Transcribe: POST /transcribe (Whisper)

## Persistence
All data stored in MongoDB indefinitely. No client-side AsyncStorage needed —
data fetched from backend on every focus.

## Reminder firing
Frontend polls `/api/reminders` every 20s; fires in-app toast + TTS when due.

## Smart Business Enhancement
Streak gamification + daily-budget progress bar create habit lock-in (drives DAU
and reinforces user data accumulation, which improves the AI memory experience).
