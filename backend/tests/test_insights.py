"""
Backend tests for GET /api/insights endpoint (new feature - iteration 4)
Tests: week period, month period, response structure, summary fields, days array
"""
import pytest
import requests
import os

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


class TestInsightsWeek:
    """GET /api/insights?period=week"""

    def test_week_returns_200(self, session):
        r = session.get(f'{BASE_URL}/api/insights?period=week')
        assert r.status_code == 200, f'Expected 200, got {r.status_code}: {r.text[:200]}'
        print('PASS: week returns 200')

    def test_week_has_period_field(self, session):
        r = session.get(f'{BASE_URL}/api/insights?period=week')
        data = r.json()
        assert data.get('period') == 'week', f'period field mismatch: {data.get("period")}'
        print(f'PASS: period = {data["period"]}')

    def test_week_has_7_days(self, session):
        r = session.get(f'{BASE_URL}/api/insights?period=week')
        data = r.json()
        days = data.get('days', [])
        assert len(days) == 7, f'Expected 7 days, got {len(days)}'
        print(f'PASS: days count = {len(days)}')

    def test_week_day_keys(self, session):
        r = session.get(f'{BASE_URL}/api/insights?period=week')
        data = r.json()
        days = data.get('days', [])
        assert len(days) > 0, 'No days returned'
        day = days[0]
        required_keys = ['date', 'label', 'habits_pct', 'expense_total', 'water', 'calories']
        for key in required_keys:
            assert key in day, f'Missing key: {key}'
        print(f'PASS: day keys present: {list(day.keys())}')

    def test_week_day_label_is_weekday(self, session):
        """Week period labels should be 3-char weekday abbreviation like Mon/Tue"""
        r = session.get(f'{BASE_URL}/api/insights?period=week')
        data = r.json()
        days = data.get('days', [])
        valid_labels = {'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'}
        for d in days:
            assert d['label'] in valid_labels, f'Unexpected week label: {d["label"]}'
        print('PASS: all week labels are weekday abbreviations')

    def test_week_summary_structure(self, session):
        r = session.get(f'{BASE_URL}/api/insights?period=week')
        data = r.json()
        summary = data.get('summary', {})
        assert 'total_expense' in summary, 'Missing summary.total_expense'
        assert 'avg_expense' in summary, 'Missing summary.avg_expense'
        assert 'avg_habits_pct' in summary, 'Missing summary.avg_habits_pct'
        print(f'PASS: summary = {summary}')

    def test_week_summary_values_are_numeric(self, session):
        r = session.get(f'{BASE_URL}/api/insights?period=week')
        data = r.json()
        summary = data.get('summary', {})
        assert isinstance(summary['total_expense'], (int, float)), 'total_expense not numeric'
        assert isinstance(summary['avg_expense'], (int, float)), 'avg_expense not numeric'
        assert isinstance(summary['avg_habits_pct'], (int, float)), 'avg_habits_pct not numeric'
        print('PASS: summary fields are numeric')

    def test_week_habits_pct_range(self, session):
        """habits_pct should be 0-100"""
        r = session.get(f'{BASE_URL}/api/insights?period=week')
        data = r.json()
        for d in data.get('days', []):
            assert 0 <= d['habits_pct'] <= 100, f'habits_pct out of range: {d["habits_pct"]}'
        print('PASS: habits_pct values in 0-100 range')

    def test_week_expense_total_non_negative(self, session):
        r = session.get(f'{BASE_URL}/api/insights?period=week')
        data = r.json()
        for d in data.get('days', []):
            assert d['expense_total'] >= 0, f'expense_total negative: {d["expense_total"]}'
        print('PASS: expense_total values non-negative')

    def test_week_water_non_negative(self, session):
        r = session.get(f'{BASE_URL}/api/insights?period=week')
        data = r.json()
        for d in data.get('days', []):
            assert d['water'] >= 0, f'water negative: {d["water"]}'
        print('PASS: water values non-negative')

    def test_week_default_period_is_week(self, session):
        """period param should default to week if omitted"""
        r = session.get(f'{BASE_URL}/api/insights')
        assert r.status_code == 200, f'Expected 200 without period param, got {r.status_code}'
        data = r.json()
        assert data.get('period') == 'week', f'Default period should be week, got {data.get("period")}'
        print('PASS: default period is week')


class TestInsightsMonth:
    """GET /api/insights?period=month"""

    def test_month_returns_200(self, session):
        r = session.get(f'{BASE_URL}/api/insights?period=month')
        assert r.status_code == 200, f'Expected 200, got {r.status_code}: {r.text[:200]}'
        print('PASS: month returns 200')

    def test_month_has_period_field(self, session):
        r = session.get(f'{BASE_URL}/api/insights?period=month')
        data = r.json()
        assert data.get('period') == 'month', f'period field mismatch: {data.get("period")}'
        print(f'PASS: period = {data["period"]}')

    def test_month_has_30_days(self, session):
        r = session.get(f'{BASE_URL}/api/insights?period=month')
        data = r.json()
        days = data.get('days', [])
        assert len(days) == 30, f'Expected 30 days, got {len(days)}'
        print(f'PASS: month days count = {len(days)}')

    def test_month_day_label_is_date_number(self, session):
        """Month period labels should be 2-digit day numbers like 01, 15, 28"""
        r = session.get(f'{BASE_URL}/api/insights?period=month')
        data = r.json()
        days = data.get('days', [])
        for d in days:
            assert d['label'].isdigit(), f'Unexpected month label (not digit): {d["label"]}'
            assert 1 <= int(d['label']) <= 31, f'Month label out of range: {d["label"]}'
        print('PASS: all month labels are day numbers')

    def test_month_summary_structure(self, session):
        r = session.get(f'{BASE_URL}/api/insights?period=month')
        data = r.json()
        summary = data.get('summary', {})
        assert 'total_expense' in summary
        assert 'avg_expense' in summary
        assert 'avg_habits_pct' in summary
        print(f'PASS: month summary = {summary}')

    def test_month_summary_avg_expense_formula(self, session):
        """avg_expense should equal total_expense / 30"""
        r = session.get(f'{BASE_URL}/api/insights?period=month')
        data = r.json()
        summary = data.get('summary', {})
        days = data.get('days', [])
        expected_total = sum(d['expense_total'] for d in days)
        assert abs(summary['total_expense'] - round(expected_total, 2)) < 0.01, \
            f'total_expense mismatch: {summary["total_expense"]} vs {expected_total}'
        if len(days) > 0:
            expected_avg = round(expected_total / len(days), 2)
            assert abs(summary['avg_expense'] - expected_avg) < 0.01, \
                f'avg_expense mismatch: {summary["avg_expense"]} vs {expected_avg}'
        print(f'PASS: avg_expense formula correct')

    def test_month_days_sorted_chronologically(self, session):
        r = session.get(f'{BASE_URL}/api/insights?period=month')
        data = r.json()
        dates = [d['date'] for d in data.get('days', [])]
        assert dates == sorted(dates), f'Days not in chronological order: {dates[:5]}'
        print('PASS: month days in chronological order')


class TestInsightsAuth:
    """Auth edge cases for insights endpoint"""

    def test_no_auth_returns_401(self):
        r = requests.get(f'{BASE_URL}/api/insights?period=week')
        assert r.status_code == 401, f'Expected 401, got {r.status_code}'
        print('PASS: no auth returns 401')

    def test_invalid_token_returns_401(self):
        r = requests.get(
            f'{BASE_URL}/api/insights?period=week',
            headers={'Authorization': 'Bearer invalid_token_xyz'}
        )
        assert r.status_code == 401, f'Expected 401, got {r.status_code}'
        print('PASS: invalid token returns 401')

    def test_invalid_period_uses_week_fallback(self, session):
        """Invalid period should default to 7 days (week behaviour)"""
        r = session.get(f'{BASE_URL}/api/insights?period=invalid')
        # API returns 200 - period != 'month' so defaults to 7 days
        assert r.status_code == 200, f'Expected 200, got {r.status_code}'
        data = r.json()
        assert len(data.get('days', [])) == 7, \
            f'Expected 7 days for invalid period, got {len(data.get("days", []))}'
        print('PASS: invalid period returns 7 days (week fallback)')
