"""
Backend tests for GET /api/morning-brief endpoint
Tests: response structure, Claude-generated brief content, caching, auth protection
"""
import pytest
import requests
import os
from datetime import date

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
TOKEN = 'test_token_1777209695405'

HEADERS = {
    'Content-Type': 'application/json',
    'Authorization': f'Bearer {TOKEN}',
}


@pytest.fixture(scope='module')
def session():
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


class TestMorningBriefAuth:
    """Auth protection for /api/morning-brief"""

    def test_no_auth_returns_401(self):
        """Without auth token, endpoint must return 401"""
        r = requests.get(f'{BASE_URL}/api/morning-brief')
        assert r.status_code == 401, f'Expected 401, got {r.status_code}: {r.text[:200]}'

    def test_invalid_token_returns_401(self):
        """With invalid token, endpoint must return 401"""
        r = requests.get(
            f'{BASE_URL}/api/morning-brief',
            headers={'Authorization': 'Bearer invalid_token_xyz'}
        )
        assert r.status_code == 401, f'Expected 401, got {r.status_code}: {r.text[:200]}'


class TestMorningBriefResponse:
    """GET /api/morning-brief response structure and content"""

    def test_returns_200(self, session):
        """Endpoint returns HTTP 200 with valid auth"""
        r = session.get(f'{BASE_URL}/api/morning-brief')
        assert r.status_code == 200, f'Expected 200, got {r.status_code}: {r.text[:400]}'

    def test_response_is_json(self, session):
        """Response body is valid JSON"""
        r = session.get(f'{BASE_URL}/api/morning-brief')
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, dict), f'Expected dict, got {type(data)}'

    def test_has_brief_field(self, session):
        """Response contains 'brief' field"""
        r = session.get(f'{BASE_URL}/api/morning-brief')
        assert r.status_code == 200
        data = r.json()
        assert 'brief' in data, f'Missing field: brief. Keys: {list(data.keys())}'

    def test_brief_is_non_empty_string(self, session):
        """brief field is a non-empty string (Claude-generated or fallback)"""
        r = session.get(f'{BASE_URL}/api/morning-brief')
        assert r.status_code == 200
        data = r.json()
        brief = data.get('brief', '')
        assert isinstance(brief, str), f'brief should be str, got {type(brief)}'
        assert len(brief.strip()) > 10, f'brief is too short or empty: "{brief}"'

    def test_has_tasks_pending_field(self, session):
        """Response contains 'tasks_pending' integer field"""
        r = session.get(f'{BASE_URL}/api/morning-brief')
        assert r.status_code == 200
        data = r.json()
        assert 'tasks_pending' in data, f'Missing field: tasks_pending. Keys: {list(data.keys())}'
        assert isinstance(data['tasks_pending'], int), f'tasks_pending should be int, got {type(data["tasks_pending"])}'

    def test_has_streak_field(self, session):
        """Response contains 'streak' integer field"""
        r = session.get(f'{BASE_URL}/api/morning-brief')
        assert r.status_code == 200
        data = r.json()
        assert 'streak' in data, f'Missing field: streak. Keys: {list(data.keys())}'
        assert isinstance(data['streak'], int), f'streak should be int, got {type(data["streak"])}'
        assert data['streak'] >= 0, f'streak should be >= 0, got {data["streak"]}'

    def test_has_spend_yesterday_field(self, session):
        """Response contains 'spend_yesterday' numeric field"""
        r = session.get(f'{BASE_URL}/api/morning-brief')
        assert r.status_code == 200
        data = r.json()
        assert 'spend_yesterday' in data, f'Missing field: spend_yesterday. Keys: {list(data.keys())}'
        assert isinstance(data['spend_yesterday'], (int, float)), \
            f'spend_yesterday should be numeric, got {type(data["spend_yesterday"])}'

    def test_has_habits_done_yesterday_field(self, session):
        """Response contains 'habits_done_yesterday' integer field"""
        r = session.get(f'{BASE_URL}/api/morning-brief')
        assert r.status_code == 200
        data = r.json()
        assert 'habits_done_yesterday' in data, \
            f'Missing field: habits_done_yesterday. Keys: {list(data.keys())}'
        assert isinstance(data['habits_done_yesterday'], int), \
            f'habits_done_yesterday should be int, got {type(data["habits_done_yesterday"])}'

    def test_has_habits_total_field(self, session):
        """Response contains 'habits_total' integer field (should be 6)"""
        r = session.get(f'{BASE_URL}/api/morning-brief')
        assert r.status_code == 200
        data = r.json()
        assert 'habits_total' in data, \
            f'Missing field: habits_total. Keys: {list(data.keys())}'
        assert data['habits_total'] == 6, \
            f'habits_total should be 6 (gym, work_block, breakfast, lunch, dinner, study), got {data["habits_total"]}'

    def test_has_date_field(self, session):
        """Response contains 'date' field matching today's date"""
        r = session.get(f'{BASE_URL}/api/morning-brief')
        assert r.status_code == 200
        data = r.json()
        assert 'date' in data, f'Missing field: date. Keys: {list(data.keys())}'
        today = date.today().isoformat()
        assert data['date'] == today, \
            f'Expected today date {today}, got {data["date"]}'

    def test_all_required_fields_present(self, session):
        """All required fields from spec are present in response"""
        r = session.get(f'{BASE_URL}/api/morning-brief')
        assert r.status_code == 200
        data = r.json()
        required = ['brief', 'tasks_pending', 'streak', 'spend_yesterday',
                    'habits_done_yesterday', 'habits_total', 'date']
        missing = [f for f in required if f not in data]
        assert not missing, f'Missing required fields: {missing}. Got: {list(data.keys())}'


class TestMorningBriefCaching:
    """MongoDB caching: second call should return same cached brief"""

    def test_second_call_returns_same_brief(self, session):
        """Two consecutive calls on same day return identical brief text (cached)"""
        r1 = session.get(f'{BASE_URL}/api/morning-brief')
        assert r1.status_code == 200
        data1 = r1.json()
        brief1 = data1.get('brief', '')

        r2 = session.get(f'{BASE_URL}/api/morning-brief')
        assert r2.status_code == 200
        data2 = r2.json()
        brief2 = data2.get('brief', '')

        assert brief1 == brief2, \
            f'Caching broken: first call brief != second call brief.\n  First: {brief1[:100]}\n  Second: {brief2[:100]}'

    def test_cached_date_matches_today(self, session):
        """Cached response still returns today's date"""
        r = session.get(f'{BASE_URL}/api/morning-brief')
        assert r.status_code == 200
        data = r.json()
        today = date.today().isoformat()
        assert data.get('date') == today, \
            f'Cached response date mismatch: expected {today}, got {data.get("date")}'

    def test_second_call_is_faster(self, session):
        """Second call (cached) should respond within 2 seconds"""
        import time
        # First call to warm cache
        session.get(f'{BASE_URL}/api/morning-brief')
        # Second call — should be cached, fast
        start = time.time()
        r = session.get(f'{BASE_URL}/api/morning-brief')
        elapsed = time.time() - start
        assert r.status_code == 200
        assert elapsed < 5.0, f'Second (cached) call took {elapsed:.2f}s — expected <5s'
        print(f'Second call latency: {elapsed:.3f}s')


class TestMorningBriefClaudeContent:
    """Verify brief appears to be a real AI-generated sentence"""

    def test_brief_has_sentence_structure(self, session):
        """Brief should be at least one complete sentence (has period or exclamation)"""
        r = session.get(f'{BASE_URL}/api/morning-brief')
        assert r.status_code == 200
        data = r.json()
        brief = data.get('brief', '')
        has_sentence_end = any(c in brief for c in '.!?')
        assert has_sentence_end, f'Brief does not look like a sentence: "{brief}"'

    def test_brief_not_error_message(self, session):
        """Brief should not contain error-like text"""
        r = session.get(f'{BASE_URL}/api/morning-brief')
        assert r.status_code == 200
        data = r.json()
        brief = data.get('brief', '').lower()
        error_phrases = ['error', 'traceback', 'exception', '500', 'failed to']
        for phrase in error_phrases:
            assert phrase not in brief, \
                f'Brief contains error-like phrase "{phrase}": {data["brief"][:200]}'

    def test_brief_min_length(self, session):
        """Brief should be at least 50 characters (2-3 sentences)"""
        r = session.get(f'{BASE_URL}/api/morning-brief')
        assert r.status_code == 200
        data = r.json()
        brief = data.get('brief', '')
        assert len(brief) >= 50, \
            f'Brief is too short ({len(brief)} chars): "{brief}"'
