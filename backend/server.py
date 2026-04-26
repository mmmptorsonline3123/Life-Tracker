"""
Aura — Personal AI Assistant Backend
FastAPI + MongoDB + Claude Sonnet 4.5 (memory) + Whisper (voice transcription)
"""
from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import tempfile
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAISpeechToText

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

app = FastAPI(title="Aura Assistant API")
api_router = APIRouter(prefix="/api")

USER_ID = "default_user"  # single-user app
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
    fire_at: str  # ISO timestamp
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
    key: str  # gym | work_block | etc
    done: bool


class HealthAction(BaseModel):
    action: Literal["water_inc", "water_dec", "calorie_add", "calorie_sub", "workout_toggle"]
    value: Optional[int] = None  # for calorie_add value e.g. 100, 300


class MoodSet(BaseModel):
    mood: Literal["Great", "Good", "Okay", "Low", "Stressed"]


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = "main"


# ============== TASKS ==============

@api_router.post("/tasks", response_model=Task)
async def create_task(payload: TaskCreate):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": USER_ID,
        "title": payload.title,
        "priority": payload.priority,
        "done": False,
        "created_at": to_iso(now_utc()),
        "completed_at": None,
    }
    await db.tasks.insert_one(doc.copy())
    return Task(**{k: v for k, v in doc.items() if k != "user_id"})


@api_router.get("/tasks", response_model=List[Task])
async def list_tasks(filter: str = "all"):
    q = {"user_id": USER_ID}
    if filter == "pending":
        q["done"] = False
    elif filter == "done":
        q["done"] = True
    docs = await db.tasks.find(q, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(500)
    return [Task(**d) for d in docs]


@api_router.patch("/tasks/{task_id}/toggle", response_model=Task)
async def toggle_task(task_id: str):
    doc = await db.tasks.find_one({"id": task_id, "user_id": USER_ID}, {"_id": 0, "user_id": 0})
    if not doc:
        raise HTTPException(404, "Task not found")
    new_done = not doc["done"]
    completed_at = to_iso(now_utc()) if new_done else None
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {"done": new_done, "completed_at": completed_at}},
    )
    doc["done"] = new_done
    doc["completed_at"] = completed_at
    return Task(**doc)


@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    res = await db.tasks.delete_one({"id": task_id, "user_id": USER_ID})
    return {"deleted": res.deleted_count}


# ============== HABITS ==============

@api_router.get("/habits/today")
async def get_habits_today():
    date = today_str()
    doc = await db.habit_logs.find_one({"user_id": USER_ID, "date": date}, {"_id": 0})
    state = (doc or {}).get("state", {k: False for k in HABIT_KEYS})
    # ensure all keys present
    for k in HABIT_KEYS:
        state.setdefault(k, False)

    # streak: count consecutive days where ALL 6 habits done (going back)
    streak = 0
    cursor = await db.habit_logs.find({"user_id": USER_ID}, {"_id": 0}).sort("date", -1).to_list(400)
    today_all = all(state.get(k, False) for k in HABIT_KEYS)
    # walk consecutive days backwards
    days = {d["date"]: d.get("state", {}) for d in cursor}
    cur = now_utc().date()
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
    return {"date": date, "state": state, "labels": HABIT_LABELS, "streak": streak}


@api_router.post("/habits/toggle")
async def toggle_habit(payload: HabitToggle):
    if payload.key not in HABIT_KEYS:
        raise HTTPException(400, "Unknown habit key")
    date = today_str()
    existing = await db.habit_logs.find_one({"user_id": USER_ID, "date": date}, {"_id": 0})
    state = (existing or {}).get("state", {k: False for k in HABIT_KEYS})
    state[payload.key] = payload.done
    await db.habit_logs.update_one(
        {"user_id": USER_ID, "date": date},
        {"$set": {"state": state, "updated_at": to_iso(now_utc())}},
        upsert=True,
    )
    return {"date": date, "state": state}


# ============== EXPENSES ==============

@api_router.post("/expenses", response_model=Expense)
async def create_expense(payload: ExpenseCreate):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": USER_ID,
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
async def list_expenses(date: Optional[str] = None):
    q = {"user_id": USER_ID}
    if date:
        q["date"] = date
    docs = await db.expenses.find(q, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(500)
    return [Expense(**d) for d in docs]


@api_router.delete("/expenses/{exp_id}")
async def delete_expense(exp_id: str):
    res = await db.expenses.delete_one({"id": exp_id, "user_id": USER_ID})
    return {"deleted": res.deleted_count}


@api_router.get("/expenses/today/total")
async def expenses_today_total():
    docs = await db.expenses.find({"user_id": USER_ID, "date": today_str()}, {"_id": 0}).to_list(500)
    total = sum(d["amount"] for d in docs)
    return {"total": total, "count": len(docs)}


# ============== HEALTH ==============

@api_router.get("/health/today")
async def get_health_today():
    date = today_str()
    doc = await db.health_logs.find_one({"user_id": USER_ID, "date": date}, {"_id": 0})
    if not doc:
        return {"date": date, "water": 0, "calories": 0, "workout": False}
    return {
        "date": date,
        "water": doc.get("water", 0),
        "calories": doc.get("calories", 0),
        "workout": doc.get("workout", False),
    }


@api_router.post("/health/action")
async def health_action(payload: HealthAction):
    date = today_str()
    existing = await db.health_logs.find_one({"user_id": USER_ID, "date": date}, {"_id": 0}) or {}
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
        {"user_id": USER_ID, "date": date},
        {"$set": {"water": water, "calories": calories, "workout": workout, "updated_at": to_iso(now_utc())}},
        upsert=True,
    )
    return {"date": date, "water": water, "calories": calories, "workout": workout}


# ============== REMINDERS ==============

@api_router.post("/reminders", response_model=Reminder)
async def create_reminder(payload: ReminderCreate):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": USER_ID,
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
async def list_reminders():
    docs = await db.reminders.find({"user_id": USER_ID}, {"_id": 0, "user_id": 0, "fired": 0}).sort("fire_at", 1).to_list(500)
    return [Reminder(**d) for d in docs]


@api_router.patch("/reminders/{rid}/done", response_model=Reminder)
async def mark_reminder_done(rid: str):
    await db.reminders.update_one({"id": rid, "user_id": USER_ID}, {"$set": {"done": True}})
    doc = await db.reminders.find_one({"id": rid, "user_id": USER_ID}, {"_id": 0, "user_id": 0, "fired": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return Reminder(**doc)


@api_router.delete("/reminders/{rid}")
async def delete_reminder(rid: str):
    res = await db.reminders.delete_one({"id": rid, "user_id": USER_ID})
    return {"deleted": res.deleted_count}


# ============== JOURNAL ==============

@api_router.post("/journal", response_model=JournalEntry)
async def create_journal(payload: JournalCreate):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": USER_ID,
        "text": payload.text,
        "mood": payload.mood,
        "date": today_str(),
        "created_at": to_iso(now_utc()),
    }
    await db.journal.insert_one(doc.copy())
    return JournalEntry(**{k: v for k, v in doc.items() if k != "user_id"})


@api_router.get("/journal", response_model=List[JournalEntry])
async def list_journal():
    docs = await db.journal.find({"user_id": USER_ID}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(300)
    return [JournalEntry(**d) for d in docs]


@api_router.delete("/journal/{jid}")
async def delete_journal(jid: str):
    res = await db.journal.delete_one({"id": jid, "user_id": USER_ID})
    return {"deleted": res.deleted_count}


# ============== MOOD ==============

@api_router.post("/mood")
async def set_mood(payload: MoodSet):
    date = today_str()
    await db.moods.update_one(
        {"user_id": USER_ID, "date": date},
        {"$set": {"mood": payload.mood, "updated_at": to_iso(now_utc())}},
        upsert=True,
    )
    return {"date": date, "mood": payload.mood}


@api_router.get("/mood/today")
async def get_mood_today():
    date = today_str()
    doc = await db.moods.find_one({"user_id": USER_ID, "date": date}, {"_id": 0})
    return {"date": date, "mood": (doc or {}).get("mood")}


# ============== DASHBOARD ==============

@api_router.get("/dashboard")
async def dashboard():
    date = today_str()
    # tasks
    all_tasks = await db.tasks.find({"user_id": USER_ID}, {"_id": 0, "user_id": 0}).to_list(500)
    pending = [t for t in all_tasks if not t["done"]]
    done_today = [
        t for t in all_tasks
        if t["done"] and t.get("completed_at", "").startswith(date)
    ]
    # habits
    h = await db.habit_logs.find_one({"user_id": USER_ID, "date": date}, {"_id": 0}) or {}
    state = h.get("state", {})
    habits_done = sum(1 for k in HABIT_KEYS if state.get(k, False))
    # expenses
    exp_docs = await db.expenses.find({"user_id": USER_ID, "date": date}, {"_id": 0}).to_list(500)
    expense_total = sum(d["amount"] for d in exp_docs)
    # health
    health = await db.health_logs.find_one({"user_id": USER_ID, "date": date}, {"_id": 0}) or {}
    # mood
    mood = await db.moods.find_one({"user_id": USER_ID, "date": date}, {"_id": 0}) or {}
    # next reminder
    upcoming = await db.reminders.find(
        {"user_id": USER_ID, "done": False, "fire_at": {"$gte": to_iso(now_utc())}},
        {"_id": 0, "user_id": 0, "fired": 0},
    ).sort("fire_at", 1).to_list(1)
    next_reminder = upcoming[0] if upcoming else None

    # streak (same logic as habits/today)
    cursor = await db.habit_logs.find({"user_id": USER_ID}, {"_id": 0}).sort("date", -1).to_list(400)
    days = {d["date"]: d.get("state", {}) for d in cursor}
    streak = 0
    cur = now_utc().date()
    today_all = all(state.get(k, False) for k in HABIT_KEYS)
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

    return {
        "date": date,
        "tasks": {
            "pending": len(pending),
            "done_today": len(done_today),
            "total": len(all_tasks),
        },
        "habits": {"done": habits_done, "total": len(HABIT_KEYS)},
        "expenses": {"total": expense_total, "count": len(exp_docs)},
        "health": {
            "water": health.get("water", 0),
            "calories": health.get("calories", 0),
            "workout": health.get("workout", False),
        },
        "mood": mood.get("mood"),
        "streak": streak,
        "next_reminder": next_reminder,
    }


# ============== CHAT (Claude memory) ==============

async def build_memory_context() -> str:
    """Aggregate the user's data into a compact context string for Claude."""
    today = today_str()
    # Last 90 days for expenses, 60 for tasks, 30 for journal/habits/health
    cutoff_90 = (now_utc() - timedelta(days=90)).date().isoformat()
    cutoff_30 = (now_utc() - timedelta(days=30)).date().isoformat()

    tasks = await db.tasks.find({"user_id": USER_ID}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(200)
    expenses = await db.expenses.find(
        {"user_id": USER_ID, "date": {"$gte": cutoff_90}}, {"_id": 0, "user_id": 0}
    ).sort("created_at", -1).to_list(500)
    habits = await db.habit_logs.find(
        {"user_id": USER_ID, "date": {"$gte": cutoff_30}}, {"_id": 0, "user_id": 0}
    ).sort("date", -1).to_list(60)
    health = await db.health_logs.find(
        {"user_id": USER_ID, "date": {"$gte": cutoff_30}}, {"_id": 0, "user_id": 0}
    ).sort("date", -1).to_list(60)
    journal = await db.journal.find({"user_id": USER_ID}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(50)
    reminders = await db.reminders.find({"user_id": USER_ID}, {"_id": 0, "user_id": 0, "fired": 0}).sort("fire_at", 1).to_list(100)
    moods = await db.moods.find({"user_id": USER_ID}, {"_id": 0, "user_id": 0}).sort("date", -1).to_list(60)

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
async def chat(payload: ChatRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "EMERGENT_LLM_KEY not configured")

    memory_ctx = await build_memory_context()
    system_msg = (
        "You are Aura, a warm and concise personal AI assistant with full memory of the user's life. "
        "You have access to the user's tasks, habits, expenses, health logs, journal entries, mood, and reminders below. "
        "Answer questions naturally using this data. Be specific with numbers and dates. "
        "If asked about totals or ranges, calculate from the data shown. "
        "Keep responses short (2-4 sentences) unless the user asks for detail. Currency is INR (₹).\n\n"
        f"{memory_ctx}"
    )

    chat_obj = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"{USER_ID}_{payload.session_id}",
        system_message=system_msg,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    user_msg = UserMessage(text=payload.message)
    try:
        reply = await chat_obj.send_message(user_msg)
    except Exception as e:
        logging.exception("Chat error")
        raise HTTPException(500, f"Chat failed: {str(e)}")

    # persist message history
    msg_doc = {
        "id": str(uuid.uuid4()),
        "user_id": USER_ID,
        "session_id": payload.session_id,
        "user_message": payload.message,
        "ai_reply": reply,
        "created_at": to_iso(now_utc()),
    }
    await db.chat_messages.insert_one(msg_doc.copy())

    return {"reply": reply, "id": msg_doc["id"]}


@api_router.get("/chat/history")
async def chat_history(session_id: str = "main"):
    docs = await db.chat_messages.find(
        {"user_id": USER_ID, "session_id": session_id},
        {"_id": 0, "user_id": 0},
    ).sort("created_at", 1).to_list(200)
    return docs


# ============== TRANSCRIBE (Whisper) ==============

@api_router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "EMERGENT_LLM_KEY not configured")
    # save to temp file
    suffix = Path(file.filename or "audio.m4a").suffix or ".m4a"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        contents = await file.read()
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


# ============== ROOT ==============

@api_router.get("/")
async def root():
    return {"message": "Aura API", "version": "1.0"}


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
