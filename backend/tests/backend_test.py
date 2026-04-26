"""
Aura backend regression tests — pytest format.
Covers: tasks, habits, expenses, health, reminders, journal, mood, dashboard, chat, transcribe.
"""
import os
import io
import time
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://personal-ai-hub-62.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- ROOT ----------
class TestRoot:
    def test_root(self, client):
        r = client.get(f"{API}/")
        assert r.status_code == 200
        assert "Aura" in r.json().get("message", "")


# ---------- TASKS ----------
class TestTasks:
    created_id = None

    def test_create_task(self, client):
        r = client.post(f"{API}/tasks", json={"title": "TEST_buy groceries", "priority": "high"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == "TEST_buy groceries"
        assert d["priority"] == "high"
        assert d["done"] is False
        assert "id" in d
        TestTasks.created_id = d["id"]

    def test_list_tasks(self, client):
        r = client.get(f"{API}/tasks")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert any(t["id"] == TestTasks.created_id for t in data)

    def test_filter_pending(self, client):
        r = client.get(f"{API}/tasks?filter=pending")
        assert r.status_code == 200
        assert all(not t["done"] for t in r.json())

    def test_toggle(self, client):
        r = client.patch(f"{API}/tasks/{TestTasks.created_id}/toggle")
        assert r.status_code == 200
        assert r.json()["done"] is True
        # toggle again
        r2 = client.patch(f"{API}/tasks/{TestTasks.created_id}/toggle")
        assert r2.json()["done"] is False

    def test_toggle_404(self, client):
        r = client.patch(f"{API}/tasks/nonexistent-id/toggle")
        assert r.status_code == 404

    def test_delete(self, client):
        r = client.delete(f"{API}/tasks/{TestTasks.created_id}")
        assert r.status_code == 200
        assert r.json()["deleted"] == 1
        # verify gone
        r2 = client.get(f"{API}/tasks")
        assert all(t["id"] != TestTasks.created_id for t in r2.json())


# ---------- HABITS ----------
class TestHabits:
    def test_get_today(self, client):
        r = client.get(f"{API}/habits/today")
        assert r.status_code == 200
        d = r.json()
        assert "state" in d and "labels" in d and "streak" in d
        for k in ["gym", "work_block", "breakfast", "lunch", "dinner", "study"]:
            assert k in d["state"]

    def test_toggle_unknown(self, client):
        r = client.post(f"{API}/habits/toggle", json={"key": "invalid", "done": True})
        assert r.status_code == 400

    def test_toggle_valid(self, client):
        r = client.post(f"{API}/habits/toggle", json={"key": "gym", "done": True})
        assert r.status_code == 200
        assert r.json()["state"]["gym"] is True
        # un-toggle for cleanliness
        client.post(f"{API}/habits/toggle", json={"key": "gym", "done": False})


# ---------- EXPENSES ----------
class TestExpenses:
    created_id = None

    def test_create(self, client):
        r = client.post(f"{API}/expenses", json={
            "description": "TEST_lunch", "amount": 250.50, "category": "Food", "payment": "UPI",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["amount"] == 250.50
        assert d["category"] == "Food"
        TestExpenses.created_id = d["id"]

    def test_list(self, client):
        r = client.get(f"{API}/expenses")
        assert r.status_code == 200
        assert any(e["id"] == TestExpenses.created_id for e in r.json())

    def test_today_total(self, client):
        r = client.get(f"{API}/expenses/today/total")
        assert r.status_code == 200
        d = r.json()
        assert "total" in d and "count" in d
        assert d["total"] >= 250.50

    def test_delete(self, client):
        r = client.delete(f"{API}/expenses/{TestExpenses.created_id}")
        assert r.status_code == 200
        assert r.json()["deleted"] == 1


# ---------- HEALTH ----------
class TestHealth:
    def test_get_today(self, client):
        r = client.get(f"{API}/health/today")
        assert r.status_code == 200
        d = r.json()
        assert "water" in d and "calories" in d and "workout" in d

    def test_water_inc_dec(self, client):
        before = client.get(f"{API}/health/today").json()["water"]
        r = client.post(f"{API}/health/action", json={"action": "water_inc"})
        assert r.status_code == 200
        assert r.json()["water"] == before + 1
        r2 = client.post(f"{API}/health/action", json={"action": "water_dec"})
        assert r2.json()["water"] == before

    def test_calorie_add_sub(self, client):
        before = client.get(f"{API}/health/today").json()["calories"]
        r = client.post(f"{API}/health/action", json={"action": "calorie_add", "value": 300})
        assert r.json()["calories"] == before + 300
        r2 = client.post(f"{API}/health/action", json={"action": "calorie_sub", "value": 300})
        assert r2.json()["calories"] == before

    def test_workout_toggle(self, client):
        before = client.get(f"{API}/health/today").json()["workout"]
        r = client.post(f"{API}/health/action", json={"action": "workout_toggle"})
        assert r.json()["workout"] is (not before)
        # restore
        client.post(f"{API}/health/action", json={"action": "workout_toggle"})


# ---------- REMINDERS ----------
class TestReminders:
    created_id = None

    def test_create(self, client):
        fire_at = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        r = client.post(f"{API}/reminders", json={
            "title": "TEST_call mom", "fire_at": fire_at, "repeat": "once",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == "TEST_call mom"
        assert d["done"] is False
        TestReminders.created_id = d["id"]

    def test_list(self, client):
        r = client.get(f"{API}/reminders")
        assert r.status_code == 200
        assert any(x["id"] == TestReminders.created_id for x in r.json())

    def test_mark_done(self, client):
        r = client.patch(f"{API}/reminders/{TestReminders.created_id}/done")
        assert r.status_code == 200
        assert r.json()["done"] is True

    def test_delete(self, client):
        r = client.delete(f"{API}/reminders/{TestReminders.created_id}")
        assert r.status_code == 200
        assert r.json()["deleted"] == 1


# ---------- JOURNAL ----------
class TestJournal:
    created_id = None

    def test_create(self, client):
        r = client.post(f"{API}/journal", json={"text": "TEST_today was good", "mood": "Good"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["text"] == "TEST_today was good"
        assert d["mood"] == "Good"
        TestJournal.created_id = d["id"]

    def test_list(self, client):
        r = client.get(f"{API}/journal")
        assert r.status_code == 200
        assert any(j["id"] == TestJournal.created_id for j in r.json())

    def test_delete(self, client):
        r = client.delete(f"{API}/journal/{TestJournal.created_id}")
        assert r.status_code == 200
        assert r.json()["deleted"] == 1


# ---------- MOOD ----------
class TestMood:
    def test_set_and_get(self, client):
        r = client.post(f"{API}/mood", json={"mood": "Great"})
        assert r.status_code == 200
        r2 = client.get(f"{API}/mood/today")
        assert r2.status_code == 200
        assert r2.json()["mood"] == "Great"

    def test_invalid_mood(self, client):
        r = client.post(f"{API}/mood", json={"mood": "Excited"})
        assert r.status_code == 422


# ---------- DASHBOARD ----------
class TestDashboard:
    def test_dashboard(self, client):
        r = client.get(f"{API}/dashboard")
        assert r.status_code == 200
        d = r.json()
        for k in ["tasks", "habits", "expenses", "health", "mood", "streak"]:
            assert k in d
        assert "pending" in d["tasks"]
        assert "done" in d["habits"]
        assert "total" in d["expenses"]


# ---------- CHAT (Claude) ----------
class TestChat:
    def test_chat_inr_currency(self, client):
        # Seed a known expense
        seed = client.post(f"{API}/expenses", json={
            "description": "TEST_chai", "amount": 42.0, "category": "Food", "payment": "UPI",
        })
        seed_id = seed.json()["id"]
        try:
            r = client.post(f"{API}/chat", json={"message": "What did I spend on food today? Give just the total in INR."}, timeout=60)
            assert r.status_code == 200, r.text
            reply = r.json()["reply"]
            assert isinstance(reply, str) and len(reply) > 0
            # Reply should reference INR currency (₹) or "INR" or rupees, since policy says currency is INR
            lower = reply.lower()
            assert ("₹" in reply) or ("inr" in lower) or ("rupee" in lower), f"No INR currency in reply: {reply}"
        finally:
            client.delete(f"{API}/expenses/{seed_id}")


# ---------- TRANSCRIBE ----------
class TestTranscribe:
    def test_no_file_returns_4xx(self, client):
        # multipart endpoint without file → FastAPI returns 422
        r = requests.post(f"{API}/transcribe")
        assert 400 <= r.status_code < 500, f"Expected 4xx, got {r.status_code}"
