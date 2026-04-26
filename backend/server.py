"""
Aura — Personal AI Assistant Backend (multi-user)
FastAPI + MongoDB + Claude Sonnet 4.5 + Whisper + Emergent Google Auth
"""
from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Request, Response, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import tempfile
import base64
import asyncio
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAISpeechToText, OpenAITextToSpeech

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

app = FastAPI(title="Aura Assistant API")
api_router = APIRouter(prefix="/api")

HABIT_KEYS = ["gym", "work_block", "breakfast", "lunch", "dinner", "study"]
HABIT_LABELS = {
    "gym": "Gym", "work_block": "Work Block", "breakfast": "Breakfast",
    "lunch": "Lunch", "dinner": "Dinner", "study": "Study",
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def today_str() -> str:
    return now_utc().date().isoformat()


def to_iso(dt) -> str:
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    return str(dt)


# ============== AUTH ==============

async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = None
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    if not token:
        token = request.cookies.get("session_token")
    if not token:
        raise HTTPException(401, "Not authenticated")
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(401, "Invalid session")
    expires_at = sess["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now_utc():
        raise HTTPException(401, "Session expired")
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


class SessionRequest(BaseModel):
    session_id: str


@api_router.post("/auth/session")
async def auth_session(payload: SessionRequest, response: Response):
    session_id = payload.session_id
    if not session_id:
        raise HTTPException(400, "session_id required")
    try:
        async with httpx.AsyncClient(timeout=20) as client_http:
            r = await client_http.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id},
            )
        if r.status_code != 200:
            raise HTTPException(401, f"Session lookup failed ({r.status_code})")
        data = r.json()
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Auth session-data error")
        raise HTTPException(500, f"Auth lookup failed: {e}")

    email = data.get("email")
    if not email:
        raise HTTPException(400, "Email missing in OAuth response")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "name": data.get("name") or existing.get("name"),
                "picture": data.get("picture") or existing.get("picture"),
                "last_login": to_iso(now_utc()),
            }},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name"),
            "picture": data.get("picture"),
            "created_at": to_iso(now_utc()),
            "last_login": to_iso(now_utc()),
        })

    session_token = data.get("session_token") or str(uuid.uuid4())
    expires_at = now_utc() + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": now_utc(),
    })

    response.set_cookie(
        key="session_token",
        value=session_token,
        max_age=7 * 24 * 60 * 60,
        path="/",
        httponly=True,
        secure=True,
        samesite="none",
    )

    return {
        "user": {
            "user_id": user_id,
            "email": email,
            "name": data.get("name"),
            "picture": data.get("picture"),
        },
        "session_token": session_token,
    }


@api_router.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return {
        "user_id": user["user_id"],
        "email": user.get("email"),
        "name": user.get("name"),
        "picture": user.get("picture"),
    }


@api_router.post("/auth/logout")
async def auth_logout(request: Request, response: Response):
    auth = request.headers.get("Authorization", "")
    token = None
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    if not token:
        token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    return {"ok": True}


# ============== MODELS ==============

class TaskCreate(BaseModel):
    title: str
    priority: Literal["high", "medium", "low"] = "medium"


class Task(BaseModel):
    id: str
    title: str
    priority: str
    done: bool = False
    created_at: str
    completed_at: Optional[str] = None


class ExpenseCreate(BaseModel):
    description: str
    amount: float
    category: Literal["Food", "Transport", "Shopping", "Health", "Gym", "Bills", "Other"] = "Other"
    payment: Literal["UPI", "Cash"] = "UPI"


class Expense(BaseModel):
    id: str
    description: str
    amount: float
    category: str
    payment: str
    created_at: str
    date: str


class ReminderCreate(BaseModel):
    title: str
    fire_at: str
    repeat: Literal["once", "daily", "weekly"] = "once"


class Reminder(BaseModel):
    id: str
    title: str
    fire_at: str
    repeat: str
    done: bool = False
    created_at: str


class JournalCreate(BaseModel):
    text: str
    mood: Optional[str] = None


class JournalEntry(BaseModel):
    id: str
    text: str
    mood: Optional[str]
    date: str
    created_at: str


class HabitToggle(BaseModel):
    key: str
    done: bool


class HealthAction(BaseModel):
    action: Literal["water_inc", "water_dec", "calorie_add", "calorie_sub", "workout_toggle"]
    value: Optional[int] = None


class MoodSet(BaseModel):
    mood: Literal["Great", "Good", "Okay", "Low", "Stressed"]


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = "main"


# ============== TASKS ==============

@api_router.post("/tasks", response_model=Task)
async def create_task(payload: TaskCreate, user: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "title": payload.title,
        "priority": payload.priority,
        "done": False,
        "created_at": to_iso(now_utc()),
        "completed_at": None,
    }
    await db.tasks.insert_one(doc.copy())
    return Task(**{k: v for k, v in doc.items() if k != "user_id"})


@api_router.get("/tasks", response_model=List[Task])
async def list_tasks(filter: str = "all", user: dict = Depends(get_current_user)):
    q = {"user_id": user["user_id"]}
    if filter == "pending":
        q["done"] = False
    elif filter == "done":
        q["done"] = True
    docs = await db.tasks.find(q, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(500)
    return [Task(**d) for d in docs]


@api_router.patch("/tasks/{task_id}/toggle", response_model=Task)
async def toggle_task(task_id: str, user: dict = Depends(get_current_user)):
    doc = await db.tasks.find_one({"id": task_id, "user_id": user["user_id"]}, {"_id": 0, "user_id": 0})
    if not doc:
        raise HTTPException(404, "Task not found")
    new_done = not doc["done"]
    completed_at = to_iso(now_utc()) if new_done else None
    await db.tasks.update_one(
        {"id": task_id, "user_id": user["user_id"]},
        {"$set": {"done": new_done, "completed_at": completed_at}},
    )
    doc["done"] = new_done
    doc["completed_at"] = completed_at
    return Task(**doc)


@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user: dict = Depends(get_current_user)):
    res = await db.tasks.delete_one({"id": task_id, "user_id": user["user_id"]})
    return {"deleted": res.deleted_count}


# ============== HABITS ==============

async def _streak_for(user_id: str, today_state: dict) -> int:
    cursor = await db.habit_logs.find({"user_id": user_id}, {"_id": 0}).sort("date", -1).to_list(400)
    days = {d["date"]: d.get("state", {}) for d in cursor}
    streak = 0
    cur = now_utc().date()
    today_all = all(today_state.get(k, False) for k in HABIT_KEYS)
    if not today_all:
        cur = cur - timedelta(days=1)
    while True:
        ds = cur.isoformat()
        s = days.get(ds, {})
        if all(s.get(k, False) for k in HABIT_KEYS):
            streak += 1
            cur = cur - timedelta(days=1)
        else:
            break
    return streak


@api_router.get("/habits/today")
async def get_habits_today(user: dict = Depends(get_current_user)):
    date = today_str()
    doc = await db.habit_logs.find_one({"user_id": user["user_id"], "date": date}, {"_id": 0})
    state = (doc or {}).get("state", {k: False for k in HABIT_KEYS})
    for k in HABIT_KEYS:
        state.setdefault(k, False)
    streak = await _streak_for(user["user_id"], state)
    return {"date": date, "state": state, "labels": HABIT_LABELS, "streak": streak}


@api_router.post("/habits/toggle")
async def toggle_habit(payload: HabitToggle, user: dict = Depends(get_current_user)):
    if payload.key not in HABIT_KEYS:
        raise HTTPException(400, "Unknown habit key")
    date = today_str()
    existing = await db.habit_logs.find_one({"user_id": user["user_id"], "date": date}, {"_id": 0})
    state = (existing or {}).get("state", {k: False for k in HABIT_KEYS})
    state[payload.key] = payload.done
    await db.habit_logs.update_one(
        {"user_id": user["user_id"], "date": date},
        {"$set": {"state": state, "updated_at": to_iso(now_utc())}},
        upsert=True,
    )
    return {"date": date, "state": state}


# ============== EXPENSES ==============

@api_router.post("/expenses", response_model=Expense)
async def create_expense(payload: ExpenseCreate, user: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "description": payload.description,
        "amount": float(payload.amount),
        "category": payload.category,
        "payment": payload.payment,
        "created_at": to_iso(now_utc()),
        "date": today_str(),
    }
    await db.expenses.insert_one(doc.copy())
    return Expense(**{k: v for k, v in doc.items() if k != "user_id"})


@api_router.get("/expenses", response_model=List[Expense])
async def list_expenses(date: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"user_id": user["user_id"]}
    if date:
        q["date"] = date
    docs = await db.expenses.find(q, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(500)
    return [Expense(**d) for d in docs]


@api_router.delete("/expenses/{exp_id}")
async def delete_expense(exp_id: str, user: dict = Depends(get_current_user)):
    res = await db.expenses.delete_one({"id": exp_id, "user_id": user["user_id"]})
    return {"deleted": res.deleted_count}


@api_router.get("/expenses/today/total")
async def expenses_today_total(user: dict = Depends(get_current_user)):
    docs = await db.expenses.find({"user_id": user["user_id"], "date": today_str()}, {"_id": 0}).to_list(500)
    total = sum(d["amount"] for d in docs)
    return {"total": total, "count": len(docs)}


# ============== HEALTH ==============

@api_router.get("/health/today")
async def get_health_today(user: dict = Depends(get_current_user)):
    date = today_str()
    doc = await db.health_logs.find_one({"user_id": user["user_id"], "date": date}, {"_id": 0})
    if not doc:
        return {"date": date, "water": 0, "calories": 0, "workout": False}
    return {
        "date": date,
        "water": doc.get("water", 0),
        "calories": doc.get("calories", 0),
        "workout": doc.get("workout", False),
    }


@api_router.post("/health/action")
async def health_action(payload: HealthAction, user: dict = Depends(get_current_user)):
    date = today_str()
    existing = await db.health_logs.find_one({"user_id": user["user_id"], "date": date}, {"_id": 0}) or {}
    water = existing.get("water", 0)
    calories = existing.get("calories", 0)
    workout = existing.get("workout", False)
    if payload.action == "water_inc":
        water = min(water + 1, 20)
    elif payload.action == "water_dec":
        water = max(water - 1, 0)
    elif payload.action == "calorie_add":
        calories = max(0, calories + (payload.value or 100))
    elif payload.action == "calorie_sub":
        calories = max(0, calories - (payload.value or 100))
    elif payload.action == "workout_toggle":
        workout = not workout
    await db.health_logs.update_one(
        {"user_id": user["user_id"], "date": date},
        {"$set": {"water": water, "calories": calories, "workout": workout, "updated_at": to_iso(now_utc())}},
        upsert=True,
    )
    return {"date": date, "water": water, "calories": calories, "workout": workout}


# ============== REMINDERS ==============

@api_router.post("/reminders", response_model=Reminder)
async def create_reminder(payload: ReminderCreate, user: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "title": payload.title,
        "fire_at": payload.fire_at,
        "repeat": payload.repeat,
        "done": False,
        "fired": False,
        "created_at": to_iso(now_utc()),
    }
    await db.reminders.insert_one(doc.copy())
    out = {k: v for k, v in doc.items() if k not in ("user_id", "fired")}
    return Reminder(**out)


@api_router.get("/reminders", response_model=List[Reminder])
async def list_reminders(user: dict = Depends(get_current_user)):
    docs = await db.reminders.find({"user_id": user["user_id"]}, {"_id": 0, "user_id": 0, "fired": 0}).sort("fire_at", 1).to_list(500)
    return [Reminder(**d) for d in docs]


@api_router.patch("/reminders/{rid}/done", response_model=Reminder)
async def mark_reminder_done(rid: str, user: dict = Depends(get_current_user)):
    await db.reminders.update_one({"id": rid, "user_id": user["user_id"]}, {"$set": {"done": True}})
    doc = await db.reminders.find_one({"id": rid, "user_id": user["user_id"]}, {"_id": 0, "user_id": 0, "fired": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return Reminder(**doc)


@api_router.delete("/reminders/{rid}")
async def delete_reminder(rid: str, user: dict = Depends(get_current_user)):
    res = await db.reminders.delete_one({"id": rid, "user_id": user["user_id"]})
    return {"deleted": res.deleted_count}


# ============== JOURNAL ==============

@api_router.post("/journal", response_model=JournalEntry)
async def create_journal(payload: JournalCreate, user: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "text": payload.text,
        "mood": payload.mood,
        "date": today_str(),
        "created_at": to_iso(now_utc()),
    }
    await db.journal.insert_one(doc.copy())
    return JournalEntry(**{k: v for k, v in doc.items() if k != "user_id"})


@api_router.get("/journal", response_model=List[JournalEntry])
async def list_journal(user: dict = Depends(get_current_user)):
    docs = await db.journal.find({"user_id": user["user_id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(300)
    return [JournalEntry(**d) for d in docs]


@api_router.delete("/journal/{jid}")
async def delete_journal(jid: str, user: dict = Depends(get_current_user)):
    res = await db.journal.delete_one({"id": jid, "user_id": user["user_id"]})
    return {"deleted": res.deleted_count}


# ============== MOOD ==============

@api_router.post("/mood")
async def set_mood(payload: MoodSet, user: dict = Depends(get_current_user)):
    date = today_str()
    await db.moods.update_one(
        {"user_id": user["user_id"], "date": date},
        {"$set": {"mood": payload.mood, "updated_at": to_iso(now_utc())}},
        upsert=True,
    )
    return {"date": date, "mood": payload.mood}


@api_router.get("/mood/today")
async def get_mood_today(user: dict = Depends(get_current_user)):
    date = today_str()
    doc = await db.moods.find_one({"user_id": user["user_id"], "date": date}, {"_id": 0})
    return {"date": date, "mood": (doc or {}).get("mood")}


# ============== DASHBOARD ==============

@api_router.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    date = today_str()
    all_tasks = await db.tasks.find({"user_id": uid}, {"_id": 0, "user_id": 0}).to_list(500)
    pending = [t for t in all_tasks if not t["done"]]
    done_today = [t for t in all_tasks if t["done"] and (t.get("completed_at") or "").startswith(date)]
    h = await db.habit_logs.find_one({"user_id": uid, "date": date}, {"_id": 0}) or {}
    state = h.get("state", {})
    habits_done = sum(1 for k in HABIT_KEYS if state.get(k, False))
    exp_docs = await db.expenses.find({"user_id": uid, "date": date}, {"_id": 0}).to_list(500)
    expense_total = sum(d["amount"] for d in exp_docs)
    health = await db.health_logs.find_one({"user_id": uid, "date": date}, {"_id": 0}) or {}
    mood = await db.moods.find_one({"user_id": uid, "date": date}, {"_id": 0}) or {}
    upcoming = await db.reminders.find(
        {"user_id": uid, "done": False, "fire_at": {"$gte": to_iso(now_utc())}},
        {"_id": 0, "user_id": 0, "fired": 0},
    ).sort("fire_at", 1).to_list(1)
    next_reminder = upcoming[0] if upcoming else None
    streak = await _streak_for(uid, state)
    return {
        "date": date,
        "tasks": {"pending": len(pending), "done_today": len(done_today), "total": len(all_tasks)},
        "habits": {"done": habits_done, "total": len(HABIT_KEYS)},
        "expenses": {"total": expense_total, "count": len(exp_docs)},
        "health": {"water": health.get("water", 0), "calories": health.get("calories", 0), "workout": health.get("workout", False)},
        "mood": mood.get("mood"),
        "streak": streak,
        "next_reminder": next_reminder,
    }


# ============== HISTORY (calendar) ==============

@api_router.get("/history/{date}")
async def history(date: str, user: dict = Depends(get_current_user)):
    """Return all data for a specific date (YYYY-MM-DD)."""
    uid = user["user_id"]
    # Tasks: created or completed on that date
    tasks_created = await db.tasks.find(
        {"user_id": uid, "created_at": {"$regex": f"^{date}"}},
        {"_id": 0, "user_id": 0},
    ).to_list(200)
    tasks_completed = await db.tasks.find(
        {"user_id": uid, "completed_at": {"$regex": f"^{date}"}},
        {"_id": 0, "user_id": 0},
    ).to_list(200)
    # Dedupe
    seen_ids = set()
    tasks = []
    for t in tasks_created + tasks_completed:
        if t["id"] in seen_ids:
            continue
        seen_ids.add(t["id"])
        tasks.append(t)

    expenses = await db.expenses.find(
        {"user_id": uid, "date": date}, {"_id": 0, "user_id": 0}
    ).sort("created_at", -1).to_list(500)
    expense_total = sum(e["amount"] for e in expenses)

    habit_log = await db.habit_logs.find_one(
        {"user_id": uid, "date": date}, {"_id": 0, "user_id": 0}
    ) or {"state": {}}
    state = habit_log.get("state", {})
    habits_done = sum(1 for k in HABIT_KEYS if state.get(k, False))

    health = await db.health_logs.find_one(
        {"user_id": uid, "date": date}, {"_id": 0, "user_id": 0}
    ) or {"water": 0, "calories": 0, "workout": False}

    journal = await db.journal.find(
        {"user_id": uid, "date": date}, {"_id": 0, "user_id": 0}
    ).sort("created_at", 1).to_list(50)

    mood_doc = await db.moods.find_one({"user_id": uid, "date": date}, {"_id": 0})
    mood = (mood_doc or {}).get("mood")

    reminders = await db.reminders.find(
        {"user_id": uid, "fire_at": {"$regex": f"^{date}"}},
        {"_id": 0, "user_id": 0, "fired": 0},
    ).sort("fire_at", 1).to_list(100)

    return {
        "date": date,
        "tasks": tasks,
        "tasks_done": sum(1 for t in tasks if t["done"]),
        "expenses": expenses,
        "expense_total": expense_total,
        "habits": {"state": state, "done": habits_done, "total": len(HABIT_KEYS), "labels": HABIT_LABELS},
        "health": {
            "water": health.get("water", 0),
            "calories": health.get("calories", 0),
            "workout": health.get("workout", False),
        },
        "journal": journal,
        "mood": mood,
        "reminders": reminders,
    }


@api_router.get("/history/active-dates/{year_month}")
async def history_active_dates(year_month: str, user: dict = Depends(get_current_user)):
    """Return list of date strings that have any data, for a given YYYY-MM month."""
    uid = user["user_id"]
    dates: set = set()
    # collect from collections that have a 'date' field
    for coll in (db.expenses, db.habit_logs, db.health_logs, db.journal, db.moods):
        cur = await coll.find(
            {"user_id": uid, "date": {"$regex": f"^{year_month}"}}, {"_id": 0, "date": 1}
        ).to_list(2000)
        for d in cur:
            if d.get("date"):
                dates.add(d["date"])
    # tasks (regex on created_at / completed_at)
    cur = await db.tasks.find(
        {"user_id": uid, "$or": [
            {"created_at": {"$regex": f"^{year_month}"}},
            {"completed_at": {"$regex": f"^{year_month}"}},
        ]},
        {"_id": 0, "created_at": 1, "completed_at": 1},
    ).to_list(2000)
    for d in cur:
        for k in ("created_at", "completed_at"):
            v = d.get(k)
            if v and v.startswith(year_month):
                dates.add(v[:10])
    return {"month": year_month, "dates": sorted(list(dates))}


# ============== MORNING BRIEF (Claude daily summary) ==============

@api_router.get("/morning-brief")
async def morning_brief(user: dict = Depends(get_current_user)):
    """Generate (or return cached) personalized morning briefing via Claude."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "EMERGENT_LLM_KEY not configured")

    user_id = user["user_id"]
    today = today_str()
    yesterday = (now_utc().date() - timedelta(days=1)).isoformat()
    name = user.get("name") or "there"
    first_name = name.split()[0] if name != "there" else "there"

    # Return cached brief for today if it exists
    cached = await db.morning_briefs.find_one({"user_id": user_id, "date": today}, {"_id": 0})
    if cached:
        return cached

    # ── Gather data ──────────────────────────────────────────────
    tasks_today, tasks_y, expenses_today, expenses_y, habits_today, habits_y, \
        health_today, moods_recent = await asyncio.gather(
        db.tasks.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(100),
        db.tasks.find({"user_id": user_id, "completed_at": {"$regex": f"^{yesterday}"}}, {"_id": 0}).to_list(50),
        db.expenses.find({"user_id": user_id, "date": today}, {"_id": 0}).to_list(100),
        db.expenses.find({"user_id": user_id, "date": yesterday}, {"_id": 0}).to_list(100),
        db.habit_logs.find_one({"user_id": user_id, "date": today}),
        db.habit_logs.find_one({"user_id": user_id, "date": yesterday}),
        db.health_logs.find_one({"user_id": user_id, "date": today}),
        db.moods.find({"user_id": user_id}, {"_id": 0}).sort("date", -1).to_list(7),
    )

    tasks_pending   = sum(1 for t in tasks_today if not t.get("done"))
    tasks_done_today = sum(1 for t in tasks_today if t.get("done") and (t.get("completed_at") or "").startswith(today))
    spend_yesterday = sum(e.get("amount", 0) for e in expenses_y)
    spend_today_so_far = sum(e.get("amount", 0) for e in expenses_today)
    habits_state_y  = habits_y.get("state", {}) if habits_y else {}
    habits_done_y   = sum(1 for k in HABIT_KEYS if habits_state_y.get(k, False))
    habits_state_t  = habits_today.get("state", {}) if habits_today else {}
    habits_done_t   = sum(1 for k in HABIT_KEYS if habits_state_t.get(k, False))
    water_today     = health_today.get("water", 0) if health_today else 0
    mood_list       = [m.get("mood") for m in moods_recent if m.get("mood")]
    mood_trend      = ", ".join(mood_list[:3]) if mood_list else "not logged recently"

    # ── Streak calculation ────────────────────────────────────────
    streak = 0
    check_date = now_utc().date()
    for _ in range(365):
        h = await db.habit_logs.find_one({"user_id": user_id, "date": check_date.isoformat()})
        if h and any(h.get("state", {}).values()):
            streak += 1
            check_date -= timedelta(days=1)
        else:
            break

    # ── Generate briefing with Claude ────────────────────────────
    data_ctx = (
        f"User first name: {first_name}\n"
        f"Today: {today}\n"
        f"Pending tasks today: {tasks_pending}\n"
        f"Tasks completed today already: {tasks_done_today}\n"
        f"Habits done today so far: {habits_done_t}/{len(HABIT_KEYS)}\n"
        f"Habits done yesterday: {habits_done_y}/{len(HABIT_KEYS)}\n"
        f"Habit streak: {streak} days\n"
        f"Yesterday's spending: ₹{spend_yesterday:.0f}\n"
        f"Today's spending so far: ₹{spend_today_so_far:.0f}\n"
        f"Water today: {water_today}/8 glasses\n"
        f"Recent mood (newest first): {mood_trend}\n"
    )
    system_msg = (
        "You are Aura, a warm, upbeat, and encouraging personal AI assistant. "
        "Generate a personalized morning briefing in exactly 2-3 sentences. "
        "Use the user's first name once naturally. "
        "Mention 2-3 specific numbers from their data. "
        "Be motivating and end with a light action-oriented encouragement for the day. "
        "Do NOT use markdown, bullet points, or emojis — plain conversational sentences only."
    )
    try:
        chat_obj = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"morning_brief_{user_id}_{today}",
            system_message=system_msg,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        brief_text = await chat_obj.send_message(UserMessage(text=f"Generate my morning briefing.\n\n{data_ctx}"))
    except Exception:
        logging.exception("Morning brief Claude error")
        brief_text = (
            f"Good morning, {first_name}! You have {tasks_pending} task{'s' if tasks_pending != 1 else ''} "
            f"waiting today and your {streak}-day habit streak is going strong. "
            f"You spent ₹{spend_yesterday:.0f} yesterday — let's make today even better!"
        )

    result = {
        "date": today,
        "brief": brief_text,
        "tasks_pending": tasks_pending,
        "streak": streak,
        "spend_yesterday": round(spend_yesterday, 0),
        "habits_done_yesterday": habits_done_y,
        "habits_total": len(HABIT_KEYS),
        "mood_today": mood_list[0] if mood_list else None,
    }
    # Cache for the day
    await db.morning_briefs.replace_one({"user_id": user_id, "date": today}, {**result, "user_id": user_id}, upsert=True)
    return result


# ============== CHAT (Claude memory) ==============

async def build_memory_context(user_id: str) -> str:
    today = today_str()
    cutoff_90 = (now_utc() - timedelta(days=90)).date().isoformat()
    cutoff_30 = (now_utc() - timedelta(days=30)).date().isoformat()
    tasks = await db.tasks.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(200)
    expenses = await db.expenses.find({"user_id": user_id, "date": {"$gte": cutoff_90}}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(500)
    habits = await db.habit_logs.find({"user_id": user_id, "date": {"$gte": cutoff_30}}, {"_id": 0, "user_id": 0}).sort("date", -1).to_list(60)
    health = await db.health_logs.find({"user_id": user_id, "date": {"$gte": cutoff_30}}, {"_id": 0, "user_id": 0}).sort("date", -1).to_list(60)
    journal = await db.journal.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(50)
    reminders = await db.reminders.find({"user_id": user_id}, {"_id": 0, "user_id": 0, "fired": 0}).sort("fire_at", 1).to_list(100)
    moods = await db.moods.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).sort("date", -1).to_list(60)

    lines = [f"# User Memory (today is {today})", ""]
    lines.append("## Tasks")
    if tasks:
        for t in tasks[:50]:
            mark = "[x]" if t["done"] else "[ ]"
            comp = f" — done {t['completed_at'][:10]}" if t.get("completed_at") else ""
            lines.append(f"- {mark} ({t['priority']}) {t['title']} (created {t['created_at'][:10]}){comp}")
    else:
        lines.append("(none)")
    lines.append("\n## Expenses (last 90 days, INR)")
    if expenses:
        for e in expenses[:200]:
            lines.append(f"- {e['date']}: ₹{e['amount']:.2f} — {e['description']} [{e['category']}/{e['payment']}]")
        total = sum(e["amount"] for e in expenses)
        lines.append(f"Total (last 90d): ₹{total:.2f}")
    else:
        lines.append("(none)")
    lines.append("\n## Habits (last 30 days)")
    if habits:
        for h in habits:
            done = [HABIT_LABELS[k] for k in HABIT_KEYS if h.get("state", {}).get(k, False)]
            lines.append(f"- {h['date']}: {', '.join(done) if done else 'none'}")
    else:
        lines.append("(none)")
    lines.append("\n## Health (last 30 days)")
    if health:
        for h in health:
            lines.append(f"- {h['date']}: water {h.get('water',0)}/8 glasses, {h.get('calories',0)} kcal, workout: {h.get('workout',False)}")
    else:
        lines.append("(none)")
    lines.append("\n## Journal entries")
    if journal:
        for j in journal[:30]:
            mood = f" [{j.get('mood')}]" if j.get("mood") else ""
            lines.append(f"- {j['date']}{mood}: {j['text'][:200]}")
    else:
        lines.append("(none)")
    lines.append("\n## Mood log")
    if moods:
        for m in moods[:30]:
            lines.append(f"- {m['date']}: {m.get('mood')}")
    else:
        lines.append("(none)")
    lines.append("\n## Reminders")
    if reminders:
        for r in reminders:
            mark = "[done]" if r.get("done") else "[pending]"
            lines.append(f"- {mark} {r['fire_at']}: {r['title']} ({r['repeat']})")
    else:
        lines.append("(none)")
    return "\n".join(lines)


@api_router.post("/chat")
async def chat(payload: ChatRequest, user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "EMERGENT_LLM_KEY not configured")
    memory_ctx = await build_memory_context(user["user_id"])
    system_msg = (
        f"You are Aura, a warm and concise personal AI assistant for {user.get('name') or 'the user'}, "
        f"with full memory of their life. You have access to their tasks, habits, expenses, health logs, "
        f"journal entries, mood, and reminders below. Answer questions naturally using this data. Be specific "
        f"with numbers and dates. Keep responses short (2-4 sentences) unless asked for detail. Currency is INR (₹).\n\n"
        f"{memory_ctx}"
    )
    chat_obj = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"{user['user_id']}_{payload.session_id}",
        system_message=system_msg,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    user_msg = UserMessage(text=payload.message)
    try:
        reply = await chat_obj.send_message(user_msg)
    except Exception as e:
        logging.exception("Chat error")
        raise HTTPException(500, f"Chat failed: {str(e)}")
    msg_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "session_id": payload.session_id,
        "user_message": payload.message,
        "ai_reply": reply,
        "created_at": to_iso(now_utc()),
    }
    await db.chat_messages.insert_one(msg_doc.copy())
    return {"reply": reply, "id": msg_doc["id"]}


@api_router.get("/chat/history")
async def chat_history(session_id: str = "main", user: dict = Depends(get_current_user)):
    docs = await db.chat_messages.find(
        {"user_id": user["user_id"], "session_id": session_id},
        {"_id": 0, "user_id": 0},
    ).sort("created_at", 1).to_list(200)
    return docs


# ============== INSIGHTS ==============

@api_router.get("/insights")
async def get_insights(period: str = "week", user: dict = Depends(get_current_user)):
    user_id = user["user_id"]
    from datetime import date as date_type
    today = now_utc().date()
    days_count = 30 if period == "month" else 7
    date_list = [(today - timedelta(days=i)).isoformat() for i in range(days_count - 1, -1, -1)]

    habit_docs = await db.habit_logs.find(
        {"user_id": user_id, "date": {"$in": date_list}}, {"_id": 0}
    ).to_list(None)
    expense_docs = await db.expenses.find(
        {"user_id": user_id, "date": {"$in": date_list}}, {"_id": 0}
    ).to_list(None)
    health_docs = await db.health_logs.find(
        {"user_id": user_id, "date": {"$in": date_list}}, {"_id": 0}
    ).to_list(None)
    mood_docs = await db.moods.find(
        {"user_id": user_id, "date": {"$in": date_list}}, {"_id": 0}
    ).to_list(None)

    habit_by_date = {d["date"]: d.get("state", {}) for d in habit_docs}
    expense_by_date: dict = {}
    for e in expense_docs:
        expense_by_date.setdefault(e["date"], 0)
        expense_by_date[e["date"]] += e.get("amount", 0)
    health_by_date = {d["date"]: d for d in health_docs}
    mood_by_date = {d["date"]: d.get("mood") for d in mood_docs}

    result = []
    for d_str in date_list:
        state = habit_by_date.get(d_str, {})
        habits_done = sum(1 for k in HABIT_KEYS if state.get(k, False))
        health = health_by_date.get(d_str, {})
        d_obj = date_type.fromisoformat(d_str)
        label = d_obj.strftime("%a") if period == "week" else d_obj.strftime("%d")
        result.append({
            "date": d_str,
            "label": label,
            "habits_done": habits_done,
            "habits_pct": round(habits_done / len(HABIT_KEYS) * 100),
            "expense_total": round(expense_by_date.get(d_str, 0), 2),
            "water": health.get("water", 0),
            "calories": health.get("calories", 0),
            "workout": health.get("workout", False),
            "mood": mood_by_date.get(d_str),
        })

    total_expense = sum(r["expense_total"] for r in result)
    avg_habits_pct = round(sum(r["habits_pct"] for r in result) / max(len(result), 1))

    return {
        "period": period,
        "days": result,
        "summary": {
            "total_expense": round(total_expense, 2),
            "avg_expense": round(total_expense / max(len(result), 1), 2),
            "avg_habits_pct": avg_habits_pct,
        },
    }


# ============== TRANSCRIBE (Whisper) ==============

@api_router.post("/transcribe")
@api_router.post("/transcribe")
async def transcribe(request: Request, user: dict = Depends(get_current_user)):
    """Accepts either JSON {audio_b64, format} (native) or multipart/form-data (web)."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "EMERGENT_LLM_KEY not configured")

    content_type = request.headers.get("content-type", "")

    if "multipart" in content_type:
        # Web path — standard multipart upload
        form = await request.form()
        file_field = form.get("file")
        if not file_field:
            raise HTTPException(422, "No file field in multipart request")
        if hasattr(file_field, "read"):
            # Proper UploadFile object
            suffix = Path(getattr(file_field, "filename", None) or "audio.m4a").suffix or ".m4a"
            contents = await file_field.read()
        elif isinstance(file_field, (bytes, bytearray)):
            contents = bytes(file_field)
            suffix = ".m4a"
        else:
            # Starlette parsed it as a string (Content-Disposition missing filename=)
            # Recover raw binary via latin-1 (Starlette's fallback encoding for binary fields)
            try:
                contents = str(file_field).encode("latin-1")
            except Exception:
                contents = str(file_field).encode("utf-8", errors="replace")
            suffix = ".m4a"
    else:
        # Native path — JSON body with base64-encoded audio (avoids FormData 422 bugs)
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(422, "Expected JSON body with audio_b64 field")
        audio_b64 = body.get("audio_b64", "")
        fmt = str(body.get("format", "m4a")).lstrip(".").strip() or "m4a"
        suffix = f".{fmt}"
        if not audio_b64:
            raise HTTPException(422, "audio_b64 is empty")
        try:
            contents = base64.b64decode(audio_b64)
        except Exception:
            raise HTTPException(422, "Invalid base64 audio data")

    if not contents or len(contents) < 512:
        return {"text": ""}

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(contents)
        tmp.close()
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        with open(tmp.name, "rb") as af:
            response = await stt.transcribe(file=af, model="whisper-1", response_format="json")
        text = getattr(response, "text", "") or ""
        return {"text": text.strip()}
    except Exception as e:
        logging.exception("Transcribe error")
        raise HTTPException(500, f"Transcription failed: {str(e)}")
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass


# ============== TTS (OpenAI) ==============

class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = "nova"  # alloy, ash, coral, echo, fable, nova, onyx, sage, shimmer
    model: Optional[str] = "tts-1"
    speed: Optional[float] = 1.05


@api_router.post("/tts")
async def tts_generate(payload: TTSRequest, user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "EMERGENT_LLM_KEY not configured")
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(400, "Empty text")
    text = text[:4000]
    try:
        tts = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
        audio_b64 = await tts.generate_speech_base64(
            text=text,
            model=payload.model or "tts-1",
            voice=payload.voice or "nova",
            speed=payload.speed or 1.05,
        )
        return {"audio_b64": audio_b64, "format": "mp3"}
    except Exception as e:
        logging.exception("TTS error")
        raise HTTPException(500, f"TTS failed: {str(e)}")


@api_router.get("/")
async def root():
    return {"message": "Aura API", "version": "2.0"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
