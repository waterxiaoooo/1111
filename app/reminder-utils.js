const NUMBER = "[0-9零〇一二两三四五六七八九十]+";

function chineseNumber(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === "十") return 10;
  if (value.includes("十")) {
    const [left, right] = value.split("十");
    return (left ? digits[left[0]] : 1) * 10 + (right ? digits[right[0]] : 0);
  }
  let result = 0;
  for (const character of value) {
    if (!(character in digits)) return null;
    result = result * 10 + digits[character];
  }
  return result;
}

function applyPeriod(period, hour) {
  if (["凌晨", "早上", "上午"].includes(period)) return hour === 12 ? 0 : hour;
  if (period === "中午") return hour < 11 ? hour + 12 : hour;
  if (["下午", "傍晚", "晚上", "夜里", "今晚"].includes(period)) return hour < 12 ? hour + 12 : hour;
  return hour;
}

function timeMatch(source) {
  const colon = source.match(/(凌晨|早上|上午|中午|下午|傍晚|晚上|夜里|今晚)?\s*(\d{1,2}):(\d{2})/);
  if (colon) {
    return {
      hour: applyPeriod(colon[1] || "", Math.min(23, Number(colon[2]))),
      minute: Math.min(59, Number(colon[3])),
      text: colon[0]
    };
  }
  const clock = source.match(new RegExp(`(凌晨|早上|上午|中午|下午|傍晚|晚上|夜里|今晚)?\\s*(${NUMBER})\\s*[点时]\\s*(半|${NUMBER})?\\s*(?:分|分钟)?`));
  if (!clock) return null;
  const hour = chineseNumber(clock[2]);
  if (hour == null) return null;
  const minute = !clock[3] ? 0 : clock[3] === "半" ? 30 : chineseNumber(clock[3]) || 0;
  return {
    hour: Math.min(23, applyPeriod(clock[1] || "", hour)),
    minute: Math.min(59, minute),
    text: clock[0]
  };
}

function dateTarget(source, now) {
  const relative = [["大后天", 3], ["后天", 2], ["明天", 1], ["今天", 0]].find(([word]) => source.includes(word));
  if (relative) return { date: addDays(now, relative[1]), matched: relative[0], explicit: true };

  const monthDay = source.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
  if (monthDay) {
    const candidate = new Date(now.getFullYear(), Number(monthDay[1]) - 1, Number(monthDay[2]));
    if (candidate < startOfDay(now)) candidate.setFullYear(candidate.getFullYear() + 1);
    return { date: candidate, matched: monthDay[0], explicit: true };
  }

  const week = source.match(/(本周|这周|下周|下个星期)?\s*(周|星期|礼拜)([一二三四五六日天])/);
  if (week) {
    const map = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
    let offset = (map[week[3]] - now.getDay() + 7) % 7;
    if (["下周", "下个星期"].includes(week[1])) offset += 7;
    return { date: addDays(now, offset), matched: week[0], explicit: true };
  }
  return { date: new Date(now), matched: "", explicit: false };
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function parseReminderText(input, current = new Date()) {
  const source = input.trim();
  if (!source) return null;

  const relative = source.match(new RegExp(`(${NUMBER})\\s*(分钟|分|小时|个小时|钟头)\\s*后`));
  const advance = source.match(new RegExp(`提前\\s*(${NUMBER})\\s*(分钟|分|小时|个小时|钟头)`));
  const matched = [];
  let triggerAt;

  if (relative) {
    const amount = chineseNumber(relative[1]);
    const minutes = /小时|钟头/.test(relative[2]) ? amount * 60 : amount;
    triggerAt = current.getTime() + minutes * 60_000;
    matched.push(relative[0]);
  } else {
    const clock = timeMatch(source);
    if (!clock) return null;
    const target = dateTarget(source, current);
    target.date.setHours(clock.hour, clock.minute, 0, 0);
    if (!target.explicit && target.date <= current) target.date.setDate(target.date.getDate() + 1);
    const advanceAmount = advance ? chineseNumber(advance[1]) : 0;
    const advanceMinutes = advance && /小时|钟头/.test(advance[2]) ? advanceAmount * 60 : advanceAmount;
    triggerAt = target.date.getTime() - advanceMinutes * 60_000;
    matched.push(clock.text, target.matched, advance?.[0] || "");
  }
  if (!triggerAt || triggerAt <= current.getTime()) return null;

  let title = source;
  ["帮我提醒", "提醒我", "请提醒", "通知我", "别忘了", "别忘", "记得", "提醒", ...matched]
    .filter(Boolean)
    .forEach((part) => { title = title.replace(part, " "); });
  title = title.replace(/[，。、“”！!；;：:,]/g, " ").replace(/\s+/g, " ").trim() || "提醒";
  return { title, triggerAt };
}

export function toLocalDateTimeValue(date = new Date(Date.now() + 60 * 60_000)) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function formatReminderTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const tomorrow = addDays(startOfDay(now), 1);
  const label = date.toDateString() === now.toDateString()
    ? "今天"
    : date.toDateString() === tomorrow.toDateString()
      ? "明天"
      : new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
  return `${label} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
