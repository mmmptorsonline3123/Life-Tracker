"""
Aura — Full API regression tests (iteration 3).
Covers all requested endpoints with proper Bearer auth.
Token: test_token_1777209695405 (seeded for user test-user-1777208185715)

Endpoints covered:
  - GET /api/  (health)
  - POST /api/auth/session (session exchange)
  - GET /api/auth/me
  - Tasks CRUD + toggle
  - Habits today + toggle
  - Expenses CRUD (INR)
  - Health today + actions
  - Reminders CRUD
  - Journal CRUD
  - Claude AI Chat (POST /api/chat)
  - TTS (POST /api/tts)
  - Transcribe (POST /api/transcribe) with WAV file
  - Calendar history (GET /api/history/{date})
  - Dashboard (GET /api/dashboard)
"""
import os
import io
import struct
import time
import wave
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://personal-ai-hub-62.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Seeded test token and user
TEST_TOKEN = "test_token_1777209695405"
TEST_USER_ID = "test-user-1777208185715"
TEST_EMAIL = "test@example.com"

AUTH_HEADERS = {"Authorization": f"Bearer {TEST_TOKEN}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def client():
    """Session-scoped requests client with test auth token."""
    s = requests.Session()
    s.headers.update(AUTH_HEADERS)
    return s


def make_wav_bytes(duration_seconds=1, sample_rate=16000, freq=440) -> bytes:
    """Generate a minimal valid WAV file in memory."""
    num_samples = sample_rate * duration_seconds
    buf = io.BytesIO()
    with wave.open(buf, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        # Generate silence (zeros) — valid PCM data
        wf.writeframes(b'\x00\x00' * num_samples)
    return buf.getvalue()


# ==================== HEALTH CHECK ====================

class TestHealthCheck:
    """Backend root health check endpoint."""

    def test_root_returns_200(self, client):
        r = client.get(f"{API}/")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "Aura" in data.get("message", ""), f"Unexpected message: {data}"


# ==================== AUTH ====================

class TestAuth:
    """Authentication: /api/auth/session and /api/auth/me."""

    def test_me_with_valid_token(self, client):
        """GET /api/auth/me returns user data with valid Bearer token."""
        r = client.get(f"{API}/auth/me")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user_id"] == TEST_USER_ID
        assert d["email"] == TEST_EMAIL
        assert "name" in d

    def test_me_without_token_returns_401(self):
        """GET /api/auth/me returns 401 without auth."""
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_with_invalid_token_returns_401(self):
        """GET /api/auth/me returns 401 with bogus token."""
        r = requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer bogus_xxx_invalid"})
        assert r.status_code == 401

    def test_auth_session_requires_session_id(self, client):
        """POST /api/auth/session with empty session_id returns 4xx."""
        r = requests.post(f"{API}/auth/session", json={"session_id": ""})
        assert r.status_code in (400, 422), f"Expected 400/422, got {r.status_code}"


# ==================== TASKS ====================

class TestTasks:
    """Tasks CRUD: create, list, toggle, delete."""
    task_id = None

    def test_create_task(self, client):
        r = client.post(f"{API}/tasks", json={"title": "TEST_task_iter3", "priority": "high"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == "TEST_task_iter3"
        assert d["priority"] == "high"
        assert d["done"] is False
        assert "id" in d
        TestTasks.task_id = d["id"]

    def test_list_tasks_contains_created(self, client):
        assert TestTasks.task_id, "Task not created (run test_create_task first)"
        r = client.get(f"{API}/tasks")
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert TestTasks.task_id in ids, f"Created task not found in list"

    def test_list_tasks_filter_pending(self, client):
        r = client.get(f"{API}/tasks?filter=pending")
        assert r.status_code == 200
        tasks = r.json()
        assert isinstance(tasks, list)
        assert all(not t["done"] for t in tasks), "Pending filter returned done tasks"

    def test_toggle_task_to_done(self, client):
        assert TestTasks.task_id
        r = client.patch(f"{API}/tasks/{TestTasks.task_id}/toggle")
        assert r.status_code == 200, r.text
        assert r.json()["done"] is True

    def test_toggle_task_back(self, client):
        assert TestTasks.task_id
        r = client.patch(f"{API}/tasks/{TestTasks.task_id}/toggle")
        assert r.status_code == 200
        assert r.json()["done"] is False

    def test_toggle_nonexistent_task_returns_404(self, client):
        r = client.patch(f"{API}/tasks/nonexistent-id-xyz/toggle")
        assert r.status_code == 404

    def test_delete_task(self, client):
        assert TestTasks.task_id
        r = client.delete(f"{API}/tasks/{TestTasks.task_id}")
        assert r.status_code == 200
        assert r.json()["deleted"] == 1
        # Verify gone
        remaining = client.get(f"{API}/tasks").json()
        assert all(t["id"] != TestTasks.task_id for t in remaining)


# ==================== HABITS ====================

class TestHabits:
    """Habits: today and toggle."""

    def test_habits_today_shape(self, client):
        r = client.get(f"{API}/habits/today")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "state" in d
        assert "labels" in d
        assert "streak" in d
        assert "date" in d
        for key in ["gym", "work_block", "breakfast", "lunch", "dinner", "study"]:
            assert key in d["state"], f"Missing habit key: {key}"

    def test_toggle_habit_valid(self, client):
        r = client.post(f"{API}/habits/toggle", json={"key": "gym", "done": True})
        assert r.status_code == 200, r.text
        assert r.json()["state"]["gym"] is True
        # Restore to False
        client.post(f"{API}/habits/toggle", json={"key": "gym", "done": False})

    def test_toggle_habit_invalid_key(self, client):
        r = client.post(f"{API}/habits/toggle", json={"key": "invalid_habit", "done": True})
        assert r.status_code == 400, f"Expected 400 for unknown habit, got {r.status_code}"


# ==================== EXPENSES (INR) ====================

class TestExpenses:
    """Expenses CRUD with INR currency."""
    expense_id = None

    def test_create_expense_inr(self, client):
        r = client.post(f"{API}/expenses", json={
            "description": "TEST_iter3_lunch", "amount": 350.0, "category": "Food", "payment": "UPI"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["amount"] == 350.0
        assert d["category"] == "Food"
        assert d["payment"] == "UPI"
        assert "id" in d
        assert "date" in d
        TestExpenses.expense_id = d["id"]

    def test_list_expenses(self, client):
        assert TestExpenses.expense_id
        r = client.get(f"{API}/expenses")
        assert r.status_code == 200
        assert any(e["id"] == TestExpenses.expense_id for e in r.json())

    def test_expenses_today_total(self, client):
        r = client.get(f"{API}/expenses/today/total")
        assert r.status_code == 200
        d = r.json()
        assert "total" in d and "count" in d
        assert d["total"] >= 350.0

    def test_delete_expense(self, client):
        assert TestExpenses.expense_id
        r = client.delete(f"{API}/expenses/{TestExpenses.expense_id}")
        assert r.status_code == 200
        assert r.json()["deleted"] == 1


# ==================== HEALTH ====================

class TestHealth:
    """Health tracking: today + actions."""

    def test_health_today_shape(self, client):
        r = client.get(f"{API}/health/today")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "water" in d
        assert "calories" in d
        assert "workout" in d
        assert "date" in d

    def test_water_inc(self, client):
        before = client.get(f"{API}/health/today").json()["water"]
        r = client.post(f"{API}/health/action", json={"action": "water_inc"})
        assert r.status_code == 200, r.text
        assert r.json()["water"] == min(before + 1, 20)
        # Restore
        client.post(f"{API}/health/action", json={"action": "water_dec"})

    def test_calorie_add(self, client):
        before = client.get(f"{API}/health/today").json()["calories"]
        r = client.post(f"{API}/health/action", json={"action": "calorie_add", "value": 200})
        assert r.status_code == 200, r.text
        assert r.json()["calories"] == before + 200
        # Restore
        client.post(f"{API}/health/action", json={"action": "calorie_sub", "value": 200})

    def test_workout_toggle(self, client):
        before = client.get(f"{API}/health/today").json()["workout"]
        r = client.post(f"{API}/health/action", json={"action": "workout_toggle"})
        assert r.status_code == 200, r.text
        assert r.json()["workout"] is (not before)
        # Restore
        client.post(f"{API}/health/action", json={"action": "workout_toggle"})

    def test_invalid_action(self, client):
        r = client.post(f"{API}/health/action", json={"action": "invalid_action"})
        assert r.status_code == 422, f"Expected 422 for invalid action, got {r.status_code}"


# ==================== REMINDERS ====================

class TestReminders:
    """Reminders CRUD."""
    reminder_id = None

    def test_create_reminder(self, client):
        fire_at = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        r = client.post(f"{API}/reminders", json={
            "title": "TEST_iter3_reminder", "fire_at": fire_at, "repeat": "once"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == "TEST_iter3_reminder"
        assert d["done"] is False
        assert d["repeat"] == "once"
        TestReminders.reminder_id = d["id"]

    def test_list_reminders(self, client):
        assert TestReminders.reminder_id
        r = client.get(f"{API}/reminders")
        assert r.status_code == 200
        assert any(rem["id"] == TestReminders.reminder_id for rem in r.json())

    def test_delete_reminder(self, client):
        assert TestReminders.reminder_id
        r = client.delete(f"{API}/reminders/{TestReminders.reminder_id}")
        assert r.status_code == 200
        assert r.json()["deleted"] == 1


# ==================== JOURNAL ====================

class TestJournal:
    """Journal CRUD."""
    journal_id = None

    def test_create_journal(self, client):
        r = client.post(f"{API}/journal", json={
            "text": "TEST_iter3_journal: Feeling productive today.", "mood": "Great"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["text"] == "TEST_iter3_journal: Feeling productive today."
        assert d["mood"] == "Great"
        assert "id" in d
        TestJournal.journal_id = d["id"]

    def test_list_journal(self, client):
        assert TestJournal.journal_id
        r = client.get(f"{API}/journal")
        assert r.status_code == 200
        assert any(j["id"] == TestJournal.journal_id for j in r.json())

    def test_delete_journal(self, client):
        assert TestJournal.journal_id
        r = client.delete(f"{API}/journal/{TestJournal.journal_id}")
        assert r.status_code == 200
        assert r.json()["deleted"] == 1


# ==================== DASHBOARD ====================

class TestDashboard:
    """Dashboard aggregation endpoint."""

    def test_dashboard_shape(self, client):
        r = client.get(f"{API}/dashboard")
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ["date", "tasks", "habits", "expenses", "health", "mood", "streak"]:
            assert key in d, f"Missing key: {key}"
        assert "pending" in d["tasks"]
        assert "done_today" in d["tasks"]
        assert "done" in d["habits"]
        assert "total" in d["habits"]
        assert "water" in d["health"]
        assert "workout" in d["health"]


# ==================== CALENDAR HISTORY ====================

class TestCalendarHistory:
    """GET /api/history/{date} returns day summary."""

    def test_history_today_shape(self, client):
        today = datetime.now().strftime("%Y-%m-%d")
        r = client.get(f"{API}/history/{today}")
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ["date", "tasks", "expenses", "expense_total", "habits", "health", "journal", "mood", "reminders"]:
            assert key in d, f"Missing key: {key}"
        assert d["date"] == today

    def test_history_old_date_empty(self, client):
        r = client.get(f"{API}/history/2000-01-01")
        assert r.status_code == 200
        d = r.json()
        assert d["expenses"] == []
        assert d["expense_total"] == 0
        assert d["journal"] == []

    def test_history_requires_auth(self):
        today = datetime.now().strftime("%Y-%m-%d")
        r = requests.get(f"{API}/history/{today}")
        assert r.status_code == 401


# ==================== CLAUDE AI CHAT ====================

class TestClaudeChat:
    """POST /api/chat uses Claude Sonnet via Emergent key."""

    def test_chat_returns_reply(self, client):
        r = client.post(f"{API}/chat", json={"message": "Hello Aura! Just say hi back."}, timeout=60)
        assert r.status_code == 200, f"Chat failed: {r.status_code}: {r.text[:300]}"
        d = r.json()
        assert "reply" in d
        assert isinstance(d["reply"], str)
        assert len(d["reply"]) > 0, "Empty reply from Claude"
        print(f"Claude reply: {d['reply'][:100]}")

    def test_chat_inr_currency_context(self, client):
        """Chat response about expenses should use INR currency."""
        # Seed an expense first
        seed = client.post(f"{API}/expenses", json={
            "description": "TEST_chat_exp", "amount": 75.0, "category": "Food", "payment": "Cash"
        })
        seed_id = seed.json().get("id") if seed.status_code == 200 else None
        try:
            r = client.post(f"{API}/chat",
                            json={"message": "How much did I spend on food today? Just the total, in INR."},
                            timeout=60)
            assert r.status_code == 200, r.text
            reply = r.json()["reply"]
            assert len(reply) > 0
            lower = reply.lower()
            has_inr = ("₹" in reply) or ("inr" in lower) or ("rupee" in lower)
            assert has_inr, f"Reply didn't mention INR/rupee: {reply}"
            print(f"INR chat reply: {reply[:150]}")
        finally:
            if seed_id:
                client.delete(f"{API}/expenses/{seed_id}")

    def test_chat_history_endpoint(self, client):
        r = client.get(f"{API}/chat/history?session_id=main")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)


# ==================== TTS ====================

class TestTTS:
    """POST /api/tts returns base64 audio."""

    def test_tts_returns_audio_b64(self, client):
        r = client.post(f"{API}/tts", json={"text": "Hello, I am Aura.", "voice": "nova"}, timeout=60)
        assert r.status_code == 200, f"TTS failed: {r.status_code}: {r.text[:300]}"
        d = r.json()
        assert "audio_b64" in d, f"No audio_b64 in response: {d}"
        assert isinstance(d["audio_b64"], str)
        assert len(d["audio_b64"]) > 100, "audio_b64 too short — suspicious"
        assert d.get("format") == "mp3"
        print(f"TTS audio_b64 length: {len(d['audio_b64'])}")

    def test_tts_empty_text_returns_400(self, client):
        r = client.post(f"{API}/tts", json={"text": ""})
        assert r.status_code == 400, f"Expected 400 for empty text, got {r.status_code}"

    def test_tts_different_voices(self, client):
        """Test at least one non-default voice."""
        r = client.post(f"{API}/tts", json={"text": "Testing shimmer voice.", "voice": "shimmer"}, timeout=60)
        assert r.status_code == 200, f"TTS with shimmer failed: {r.status_code}: {r.text[:200]}"
        assert "audio_b64" in r.json()


# ==================== TRANSCRIBE ====================

class TestTranscribe:
    """POST /api/transcribe: multipart form-data file upload."""

    def test_transcribe_no_file_returns_422(self):
        """Without a file, FastAPI should return 422."""
        r = requests.post(f"{API}/transcribe")
        assert 400 <= r.status_code < 500, f"Expected 4xx, got {r.status_code}"

    def test_transcribe_requires_auth(self):
        """Without auth, endpoint should return 401."""
        wav_bytes = make_wav_bytes(duration_seconds=1)
        files = {"file": ("audio.wav", io.BytesIO(wav_bytes), "audio/wav")}
        r = requests.post(f"{API}/transcribe", files=files)
        assert r.status_code == 401, f"Expected 401 without auth, got {r.status_code}"

    def test_transcribe_wav_file_valid_upload(self, client):
        """
        POST a valid WAV file as multipart form-data.
        Endpoint returns {"text": "..."} — text may be empty for silence, but HTTP 200 is expected.
        """
        wav_bytes = make_wav_bytes(duration_seconds=2, freq=440)
        files = {"file": ("test_audio.wav", io.BytesIO(wav_bytes), "audio/wav")}
        # Must send without Content-Type JSON header when doing multipart
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
        r = requests.post(f"{API}/transcribe", files=files, headers=headers, timeout=60)
        assert r.status_code == 200, f"Transcribe failed: {r.status_code}: {r.text[:300]}"
        d = r.json()
        assert "text" in d, f"No 'text' key in transcribe response: {d}"
        assert isinstance(d["text"], str)
        print(f"Transcribe result: '{d['text']}'")

    def test_transcribe_small_file_returns_empty_text(self, client):
        """Backend returns empty string for files < 1024 bytes without erroring."""
        tiny_wav = make_wav_bytes(duration_seconds=0)
        # Make it truly tiny (< 1024 bytes)
        tiny_data = tiny_wav[:512] if len(tiny_wav) > 512 else tiny_wav
        files = {"file": ("tiny.wav", io.BytesIO(tiny_data), "audio/wav")}
        headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
        r = requests.post(f"{API}/transcribe", files=files, headers=headers, timeout=30)
        # Should return 200 with empty text (backend short-circuits for < 1024 bytes)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"
        d = r.json()
        assert "text" in d
        assert d["text"] == "", f"Expected empty text for tiny file, got: {d['text']}"
