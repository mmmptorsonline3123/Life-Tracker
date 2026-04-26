"""
Aura — Auth + Calendar history regression tests (iteration 2).
Covers:
  - /api/auth/me gating (401 without, 200 with seeded Bearer token)
  - All resource endpoints require Bearer auth (401 without, 200 with)
  - /api/auth/logout deletes session → subsequent /me with that token = 401
  - /api/history/{YYYY-MM-DD} aggregation
  - /api/history/active-dates/{YYYY-MM} list
  - Data isolation between two seeded users (mongosh-style insert via API)
"""
import os
import time
import subprocess
import json
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://personal-ai-hub-62.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PRESEEDED_TOKEN = "test_token_1777209695405"
PRESEEDED_USER_ID = "test-user-1777208185715"
PRESEEDED_EMAIL = "test@example.com"


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _seed_user(prefix: str = "TEST_iso") -> tuple[str, str]:
    """Seed a fresh user + session via mongosh; returns (user_id, token)."""
    ts = int(time.time() * 1000)
    user_id = f"{prefix}-{ts}"
    token = f"{prefix}_token_{ts}"
    js = (
        f'db.users.insertOne({{user_id:"{user_id}",email:"{prefix}-{ts}@example.com",name:"Iso User",picture:null,created_at:new Date()}});'
        f'db.user_sessions.insertOne({{user_id:"{user_id}",session_token:"{token}",expires_at:new Date(Date.now()+7*24*60*60*1000),created_at:new Date()}});'
    )
    out = subprocess.run(
        ["mongosh", "aura_assistant", "--quiet", "--eval", js],
        capture_output=True, text=True, timeout=15,
    )
    assert out.returncode == 0, out.stderr
    return user_id, token


# ---------- AUTH GATING ----------
class TestAuthGating:
    PROTECTED_GET = [
        "/auth/me", "/dashboard",
        "/tasks", "/expenses", "/expenses/today/total",
        "/habits/today", "/health/today",
        "/reminders", "/journal", "/mood/today",
    ]

    @pytest.mark.parametrize("path", PROTECTED_GET)
    def test_get_requires_auth(self, path):
        r = requests.get(f"{API}{path}")
        assert r.status_code == 401, f"{path} expected 401, got {r.status_code}: {r.text[:200]}"

    def test_me_with_valid_token(self):
        r = requests.get(f"{API}/auth/me", headers=_headers(PRESEEDED_TOKEN))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user_id"] == PRESEEDED_USER_ID
        assert d["email"] == PRESEEDED_EMAIL
        assert "name" in d

    def test_me_with_invalid_token(self):
        r = requests.get(f"{API}/auth/me", headers=_headers("bogus_token_xxx"))
        assert r.status_code == 401

    @pytest.mark.parametrize("path", PROTECTED_GET)
    def test_get_works_with_valid_token(self, path):
        r = requests.get(f"{API}{path}", headers=_headers(PRESEEDED_TOKEN))
        assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:200]}"

    def test_post_tasks_requires_auth(self):
        r = requests.post(f"{API}/tasks", json={"title": "x", "priority": "low"})
        assert r.status_code == 401

    def test_post_tasks_with_token(self):
        r = requests.post(f"{API}/tasks", headers=_headers(PRESEEDED_TOKEN),
                          json={"title": "TEST_auth_check", "priority": "low"})
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        # cleanup
        requests.delete(f"{API}/tasks/{tid}", headers=_headers(PRESEEDED_TOKEN))


# ---------- LOGOUT ----------
class TestLogout:
    def test_logout_invalidates_session(self):
        # seed an ephemeral session for this test (don't kill the main one)
        _, tok = _seed_user(prefix="TEST_logout")
        # confirm /me works
        r = requests.get(f"{API}/auth/me", headers=_headers(tok))
        assert r.status_code == 200
        # logout
        r = requests.post(f"{API}/auth/logout", headers=_headers(tok))
        assert r.status_code == 200
        assert r.json().get("ok") is True
        # subsequent /me must be 401
        r = requests.get(f"{API}/auth/me", headers=_headers(tok))
        assert r.status_code == 401, r.text


# ---------- DATA ISOLATION ----------
class TestDataIsolation:
    @classmethod
    def setup_class(cls):
        cls.uid_a, cls.tok_a = _seed_user(prefix="TEST_isoA")
        cls.uid_b, cls.tok_b = _seed_user(prefix="TEST_isoB")
        cls.created = []

    @classmethod
    def teardown_class(cls):
        # clean tasks created
        for tid, tok in cls.created:
            try:
                requests.delete(f"{API}/tasks/{tid}", headers=_headers(tok), timeout=10)
            except Exception:
                pass
        # remove seeded users + sessions
        js = (
            f'db.users.deleteMany({{user_id: {{$in: ["{cls.uid_a}","{cls.uid_b}"]}}}});'
            f'db.user_sessions.deleteMany({{user_id: {{$in: ["{cls.uid_a}","{cls.uid_b}"]}}}});'
            f'db.tasks.deleteMany({{user_id: {{$in: ["{cls.uid_a}","{cls.uid_b}"]}}}});'
            f'db.expenses.deleteMany({{user_id: {{$in: ["{cls.uid_a}","{cls.uid_b}"]}}}});'
            f'db.journal.deleteMany({{user_id: {{$in: ["{cls.uid_a}","{cls.uid_b}"]}}}});'
        )
        subprocess.run(["mongosh", "aura_assistant", "--quiet", "--eval", js], capture_output=True, text=True, timeout=15)

    def test_user_a_task_not_visible_to_b(self):
        r = requests.post(f"{API}/tasks", headers=_headers(self.tok_a),
                          json={"title": "TEST_iso_only_A", "priority": "high"})
        assert r.status_code == 200
        tid = r.json()["id"]
        self.created.append((tid, self.tok_a))

        # User A sees it
        ra = requests.get(f"{API}/tasks", headers=_headers(self.tok_a)).json()
        assert any(t["id"] == tid for t in ra), "A should see own task"

        # User B does NOT see it
        rb = requests.get(f"{API}/tasks", headers=_headers(self.tok_b)).json()
        assert all(t["id"] != tid for t in rb), "B must not see A's task"

    def test_user_a_expense_not_visible_to_b(self):
        r = requests.post(f"{API}/expenses", headers=_headers(self.tok_a),
                          json={"description": "TEST_iso_exp_A", "amount": 99.0, "category": "Food", "payment": "UPI"})
        assert r.status_code == 200
        eid = r.json()["id"]

        ea = requests.get(f"{API}/expenses", headers=_headers(self.tok_a)).json()
        assert any(e["id"] == eid for e in ea)

        eb = requests.get(f"{API}/expenses", headers=_headers(self.tok_b)).json()
        assert all(e["id"] != eid for e in eb), "B must not see A's expense"

        # cleanup
        requests.delete(f"{API}/expenses/{eid}", headers=_headers(self.tok_a))

    def test_dashboard_isolated(self):
        da = requests.get(f"{API}/dashboard", headers=_headers(self.tok_a)).json()
        db_b = requests.get(f"{API}/dashboard", headers=_headers(self.tok_b)).json()
        # Both should return valid shapes
        for d in (da, db_b):
            for k in ["tasks", "habits", "expenses", "health", "mood", "streak"]:
                assert k in d


# ---------- CALENDAR HISTORY ----------
class TestCalendarHistory:
    @classmethod
    def setup_class(cls):
        cls.token = PRESEEDED_TOKEN
        # Seed a known expense + journal today so today's date has data
        today = datetime.now().strftime("%Y-%m-%d")
        cls.today = today
        e = requests.post(f"{API}/expenses", headers=_headers(cls.token),
                          json={"description": "TEST_cal_exp", "amount": 11.0, "category": "Food", "payment": "UPI"})
        cls.exp_id = e.json()["id"] if e.status_code == 200 else None
        j = requests.post(f"{API}/journal", headers=_headers(cls.token),
                          json={"text": "TEST_cal_journal", "mood": "Good"})
        cls.jrn_id = j.json()["id"] if j.status_code == 200 else None

    @classmethod
    def teardown_class(cls):
        if cls.exp_id:
            requests.delete(f"{API}/expenses/{cls.exp_id}", headers=_headers(cls.token))
        if cls.jrn_id:
            requests.delete(f"{API}/journal/{cls.jrn_id}", headers=_headers(cls.token))

    def test_history_requires_auth(self):
        r = requests.get(f"{API}/history/{self.today}")
        assert r.status_code == 401

    def test_history_today_shape(self):
        r = requests.get(f"{API}/history/{self.today}", headers=_headers(self.token))
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["date", "tasks", "expenses", "expense_total", "habits", "health", "journal", "mood", "reminders"]:
            assert k in d, f"missing key {k}"
        assert d["date"] == self.today
        assert isinstance(d["tasks"], list)
        assert isinstance(d["expenses"], list)
        assert d["expense_total"] >= 11.0
        assert "state" in d["habits"] and "labels" in d["habits"] and "total" in d["habits"]
        assert "water" in d["health"]
        # journal should contain seeded entry
        assert any(j.get("text") == "TEST_cal_journal" for j in d["journal"])

    def test_history_old_date_empty(self):
        r = requests.get(f"{API}/history/2000-01-15", headers=_headers(self.token))
        assert r.status_code == 200
        d = r.json()
        assert d["expenses"] == []
        assert d["expense_total"] == 0
        assert d["journal"] == []

    def test_active_dates_requires_auth(self):
        ym = datetime.now().strftime("%Y-%m")
        r = requests.get(f"{API}/history/active-dates/{ym}")
        assert r.status_code == 401

    def test_active_dates_includes_today(self):
        ym = datetime.now().strftime("%Y-%m")
        r = requests.get(f"{API}/history/active-dates/{ym}", headers=_headers(self.token))
        assert r.status_code == 200, r.text
        data = r.json()
        # response shape: list of date strings OR {"dates": [...]}
        dates = data if isinstance(data, list) else data.get("dates", [])
        assert isinstance(dates, list)
        assert self.today in dates, f"today {self.today} not in active dates: {dates}"
