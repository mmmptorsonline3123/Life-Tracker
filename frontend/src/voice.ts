// Voice command parser — maps free-form text to actions.
// Returns the action result for handlers to execute.

export type ParsedCommand =
  | { type: 'navigate'; screen: string }
  | { type: 'add_task'; title: string; priority: 'high' | 'medium' | 'low' }
  | { type: 'mark_habit'; key: string }
  | { type: 'log_water' }
  | { type: 'log_water_dec' }
  | { type: 'add_calories'; value: number }
  | { type: 'sub_calories'; value: number }
  | { type: 'workout_done' }
  | { type: 'add_expense'; amount: number; description: string; category: string; payment: 'UPI' | 'Cash' }
  | { type: 'set_mood'; mood: string }
  | { type: 'add_reminder'; title: string; fireAt: string; repeat: 'once' | 'daily' | 'weekly' }
  | { type: 'add_journal'; text: string }
  | { type: 'status' }
  | { type: 'turn_off_voice' }
  | { type: 'memory_query'; question: string }
  | { type: 'unknown'; raw: string };

const SCREEN_MAP: Record<string, string> = {
  home: '/',
  dashboard: '/',
  tasks: '/tasks',
  task: '/tasks',
  habits: '/habits',
  habit: '/habits',
  expenses: '/expenses',
  expense: '/expenses',
  health: '/health',
  fitness: '/health',
  reminders: '/reminders',
  reminder: '/reminders',
  journal: '/journal',
  notes: '/journal',
  memory: '/ai',
  ai: '/ai',
  chat: '/ai',
  assistant: '/ai',
};

const HABIT_MAP: Record<string, string> = {
  gym: 'gym',
  workout: 'gym',
  'work block': 'work_block',
  work: 'work_block',
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  study: 'study',
  studying: 'study',
};

const CATEGORY_MAP: Record<string, string> = {
  food: 'Food',
  meal: 'Food',
  lunch: 'Food',
  dinner: 'Food',
  breakfast: 'Food',
  transport: 'Transport',
  taxi: 'Transport',
  auto: 'Transport',
  cab: 'Transport',
  uber: 'Transport',
  ola: 'Transport',
  bus: 'Transport',
  metro: 'Transport',
  shopping: 'Shopping',
  shop: 'Shopping',
  health: 'Health',
  medicine: 'Health',
  doctor: 'Health',
  gym: 'Gym',
  bills: 'Bills',
  bill: 'Bills',
  electricity: 'Bills',
  rent: 'Bills',
};

const MOOD_MAP: Record<string, string> = {
  great: 'Great',
  good: 'Good',
  okay: 'Okay',
  ok: 'Okay',
  fine: 'Okay',
  low: 'Low',
  sad: 'Low',
  stressed: 'Stressed',
  anxious: 'Stressed',
};

function parseRelativeTime(input: string): Date | null {
  const now = new Date();
  // "in 30 minutes"
  const inMinMatch = input.match(/in\s+(\d+)\s*(minute|minutes|min|mins)/);
  if (inMinMatch) {
    const d = new Date(now);
    d.setMinutes(d.getMinutes() + parseInt(inMinMatch[1], 10));
    return d;
  }
  // "in 2 hours"
  const inHrMatch = input.match(/in\s+(\d+)\s*(hour|hours|hr|hrs)/);
  if (inHrMatch) {
    const d = new Date(now);
    d.setHours(d.getHours() + parseInt(inHrMatch[1], 10));
    return d;
  }
  // "tonight 9pm" / "tonight at 9"
  const tonightMatch = input.match(/tonight\s*(?:at\s*)?(\d{1,2})\s*(am|pm)?/);
  if (tonightMatch) {
    const d = new Date(now);
    let hour = parseInt(tonightMatch[1], 10);
    const period = tonightMatch[2];
    if (period === 'pm' && hour < 12) hour += 12;
    else if (!period && hour < 12) hour += 12; // tonight defaults to PM
    d.setHours(hour, 0, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return d;
  }
  // "tomorrow 9am" / "tomorrow at 9pm"
  const tmrMatch = input.match(/tomorrow\s*(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (tmrMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    let hour = parseInt(tmrMatch[1], 10);
    const min = tmrMatch[2] ? parseInt(tmrMatch[2], 10) : 0;
    const period = tmrMatch[3];
    if (period === 'pm' && hour < 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    d.setHours(hour, min, 0, 0);
    return d;
  }
  // "at 9pm" / "at 21:00"
  const atMatch = input.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (atMatch) {
    const d = new Date(now);
    let hour = parseInt(atMatch[1], 10);
    const min = atMatch[2] ? parseInt(atMatch[2], 10) : 0;
    const period = atMatch[3];
    if (period === 'pm' && hour < 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    d.setHours(hour, min, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return d;
  }
  return null;
}

export function parseCommand(raw: string): ParsedCommand {
  const text = (raw || '').trim().toLowerCase();
  if (!text) return { type: 'unknown', raw };

  // Turn off voice
  if (/turn\s*off\s*(voice|hands.free|listening)/.test(text) || /stop\s*listening/.test(text)) {
    return { type: 'turn_off_voice' };
  }

  // Status
  if (/(what'?s\s*my\s*status|daily\s*summary|my\s*summary)/.test(text)) {
    return { type: 'status' };
  }

  // Navigate
  const navMatch = text.match(/(?:go to|open|show|navigate to)\s+(?:the\s+)?(\w+(?:\s\w+)?)/);
  if (navMatch) {
    const k = navMatch[1].trim();
    if (SCREEN_MAP[k]) return { type: 'navigate', screen: SCREEN_MAP[k] };
  }

  // Mark habit done
  const habitMatch = text.match(/(?:mark|did|done with|completed)\s+(?:my\s+)?([\w\s]+?)\s+done/) ||
    text.match(/^(gym|workout|breakfast|lunch|dinner|study|work block)\s+done$/);
  if (habitMatch) {
    const phrase = (habitMatch[1] || habitMatch[0]).trim();
    for (const k in HABIT_MAP) {
      if (phrase.includes(k)) return { type: 'mark_habit', key: HABIT_MAP[k] };
    }
  }
  if (/workout\s*done/.test(text)) return { type: 'workout_done' };

  // Water
  if (/(log|add|track)\s*water/.test(text) || /drank\s*water/.test(text) || text === 'water') {
    return { type: 'log_water' };
  }
  if (/(remove|undo)\s*water/.test(text)) return { type: 'log_water_dec' };

  // Calories
  const calAdd = text.match(/add\s+(\d+)\s*(calories|kcal|cal)/) || text.match(/(\d+)\s*(calories|kcal|cal)/);
  if (calAdd) return { type: 'add_calories', value: parseInt(calAdd[1], 10) };
  const calSub = text.match(/(?:remove|subtract)\s+(\d+)\s*(calories|kcal|cal)/);
  if (calSub) return { type: 'sub_calories', value: parseInt(calSub[1], 10) };

  // Mood
  const moodMatch = text.match(/(?:i'?m|feeling|mood is|i feel)\s+(\w+)/);
  if (moodMatch) {
    const m = moodMatch[1];
    if (MOOD_MAP[m]) return { type: 'set_mood', mood: MOOD_MAP[m] };
  }

  // Reminder
  if (/^remind\s*me/.test(text) || /^set\s*(a\s*)?reminder/.test(text)) {
    const fireDate = parseRelativeTime(text);
    // extract title: remove "remind me to/about", "set reminder to", time phrases
    let title = text
      .replace(/^remind\s*me\s*(to|about|that)?\s*/, '')
      .replace(/^set\s*(a\s*)?reminder\s*(to|about|for)?\s*/, '')
      .replace(/\bin\s+\d+\s*(minute|minutes|min|mins|hour|hours|hr|hrs)\b/, '')
      .replace(/\btonight\s*(?:at\s*)?\d{1,2}\s*(am|pm)?\b/, '')
      .replace(/\btomorrow\s*(?:at\s*)?\d{1,2}(?::\d{2})?\s*(am|pm)?\b/, '')
      .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(am|pm)?\b/, '')
      .replace(/\s+daily\b/, '')
      .replace(/\s+weekly\b/, '')
      .trim();
    title = title || 'Reminder';
    const repeat: 'once' | 'daily' | 'weekly' =
      /\bdaily\b/.test(text) ? 'daily' : /\bweekly\b/.test(text) ? 'weekly' : 'once';
    const fireAt = (fireDate || new Date(Date.now() + 30 * 60000)).toISOString();
    return { type: 'add_reminder', title, fireAt, repeat };
  }

  // Expense (spent / paid)
  const expMatch = text.match(/(?:spent|paid)\s+(\d+(?:\.\d+)?)\s*(?:rupees|rs|inr)?\s*(?:on|for|cash)?\s*([\w\s]*)/);
  if (expMatch) {
    const amount = parseFloat(expMatch[1]);
    const tail = (expMatch[2] || '').trim();
    let payment: 'UPI' | 'Cash' = /\bcash\b/.test(text) ? 'Cash' : 'UPI';
    let category = 'Other';
    let description = tail;
    for (const k in CATEGORY_MAP) {
      if (tail.includes(k) || text.includes(k)) {
        category = CATEGORY_MAP[k];
        description = description || k;
        break;
      }
    }
    description = description || 'Expense';
    return { type: 'add_expense', amount, description, category, payment };
  }

  // Journal
  const noteMatch = text.match(/(?:write\s*(?:a\s*)?note|journal|note)\s+(.+)/);
  if (noteMatch) return { type: 'add_journal', text: noteMatch[1].trim() };

  // Add task
  const highTaskMatch = text.match(/^high\s*priority\s*task\s+(.+)/);
  if (highTaskMatch) return { type: 'add_task', title: highTaskMatch[1].trim(), priority: 'high' };
  const lowTaskMatch = text.match(/^low\s*priority\s*task\s+(.+)/);
  if (lowTaskMatch) return { type: 'add_task', title: lowTaskMatch[1].trim(), priority: 'low' };
  const taskMatch = text.match(/^add\s*(?:a\s*)?task\s+(.+)/);
  if (taskMatch) {
    let priority: 'high' | 'medium' | 'low' = 'medium';
    let title = taskMatch[1].trim();
    if (/\bhigh\b/.test(title)) {
      priority = 'high';
      title = title.replace(/\bhigh\s*priority\b/, '').replace(/\bhigh\b/, '').trim();
    } else if (/\blow\b/.test(title)) {
      priority = 'low';
      title = title.replace(/\blow\s*priority\b/, '').replace(/\blow\b/, '').trim();
    }
    return { type: 'add_task', title, priority };
  }

  // Memory query — anything starting with what/how/have/did/show/when
  if (/^(what|how|have|did|do|when|where|show|tell)\s/.test(text) || text.endsWith('?')) {
    return { type: 'memory_query', question: raw };
  }

  return { type: 'unknown', raw };
}
