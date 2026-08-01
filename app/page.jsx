"use client";

import {
  AlarmClock,
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Bot,
  BookHeart,
  CalendarDays,
  Check,
  ChevronRight,
  CircleUserRound,
  CloudSun,
  Flame,
  GraduationCap,
  Heart,
  Home,
  Image as ImageIcon,
  KeyRound,
  Languages,
  Lightbulb,
  ListChecks,
  LockKeyhole,
  Menu,
  Mic,
  MessageCircle,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  Send,
  Settings,
  SmilePlus,
  Sparkles,
  Tag,
  Target,
  Trash2,
  TrendingUp,
  Volume2,
  WalletCards,
  Wrench,
  X
} from "lucide-react";
import { registerPlugin } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { useEffect, useMemo, useState } from "react";
import { formatReminderTime, parseReminderText, toLocalDateTimeValue } from "./reminder-utils";

const WorkbenchNative = registerPlugin("WorkbenchNative");

const moods = [
  { emoji: "😌", label: "平静", color: "#8BB7A8" },
  { emoji: "😊", label: "开心", color: "#E9A34B" },
  { emoji: "🥰", label: "满足", color: "#E97B6C" },
  { emoji: "😵‍💫", label: "疲惫", color: "#9E91B8" },
  { emoji: "🌧️", label: "低落", color: "#6E8EA4" }
];

const starterEntries = [];
const starterTasks = [];
const starterTransactions = [];

const navItems = [
  { id: "today", label: "今天", icon: Home },
  { id: "journal", label: "日记", icon: BookHeart },
  { id: "ledger", label: "记账", icon: WalletCards },
  { id: "tools", label: "工具", icon: Wrench },
  { id: "me", label: "我的", icon: CircleUserRound }
];

function usePersistentState(key, initialValue) {
  const [value, setValue] = useState(initialValue);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const schemaVersion = window.localStorage.getItem("shiguang.schemaVersion");
      if (schemaVersion !== "3") {
        Object.keys(window.localStorage)
          .filter((storageKey) => storageKey.startsWith("shiguang."))
          .forEach((storageKey) => window.localStorage.removeItem(storageKey));
        window.localStorage.setItem("shiguang.schemaVersion", "3");
      }
      window.localStorage.removeItem("shiguang.habits");
      const saved = window.localStorage.getItem(key);
      if (saved) setValue(JSON.parse(saved));
    } catch {
      // Keep the friendly defaults when local storage is unavailable.
    }
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The app stays usable even when persistence is blocked.
    }
  }, [key, ready, value]);

  return [value, setValue];
}

function formatDate(date, options) {
  return new Intl.DateTimeFormat("zh-CN", options).format(date);
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function money(value) {
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function calculateStreak(entries) {
  const recordedDays = new Set(entries.map((entry) => dateKey(new Date(entry.date))));
  let cursor = new Date();
  if (!recordedDays.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (recordedDays.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function daysSince(dateString) {
  const start = new Date(`${dateString}T00:00:00`);
  const today = new Date(`${dateKey(new Date())}T00:00:00`);
  return Math.max(1, Math.floor((today - start) / 86400000) + 1);
}

function IconButton({ label, children, className = "", onClick }) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={25} strokeWidth={1.8} /></span>
      <strong>{title}</strong>
      <p>{text}</p>
      {action}
    </div>
  );
}

export default function Workbench() {
  const now = new Date();
  const [active, setActive] = useState("today");
  const [composerOpen, setComposerOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerAssistantOpen, setLedgerAssistantOpen] = useState(false);
  const [quickMood, setQuickMood] = useState(1);
  const [toolsSection, setToolsSection] = useState("reminders");
  const [entries, setEntries] = usePersistentState("shiguang.entries", starterEntries);
  const [tasks, setTasks] = usePersistentState("shiguang.tasks", starterTasks);
  const [transactions, setTransactions] = usePersistentState("shiguang.transactions", starterTransactions);
  const [reminders, setReminders] = usePersistentState("shiguang.reminders", []);
  const [ideas, setIdeas] = usePersistentState("shiguang.ideas", []);
  const [startedAt] = usePersistentState("shiguang.startedAt", dateKey(now));
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installation support is optional; the workbench remains fully usable.
      });
    }
    try {
      StatusBar.setStyle({ style: Style.Dark });
      StatusBar.setBackgroundColor({ color: "#EEF2F7" });
      StatusBar.setOverlaysWebView({ overlay: false });
    } catch {
      // StatusBar plugin is only available in the native shell.
    }
  }, []);

  const filteredEntries = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return entries;
    return entries.filter((entry) =>
      [entry.title, entry.body, ...(entry.tags || [])]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [entries, query]);

  const todayKey = dateKey(now);
  const todayTasks = tasks.filter((task) => (task.date || todayKey) === todayKey);
  const completedTasks = todayTasks.filter((task) => task.done).length;
  const streak = calculateStreak(entries);
  const upcomingReminders = reminders.filter((reminder) => !reminder.done && reminder.triggerAt > Date.now());

  const openComposer = () => setComposerOpen(true);
  const handleNav = (id) => {
    setActive(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const openTool = (section) => {
    setToolsSection(section);
    handleNav("tools");
  };

  const saveReminder = async (reminder) => {
    setReminders((current) => [reminder, ...current.filter((item) => item.id !== reminder.id)]);
    try {
      const permission = await WorkbenchNative.requestNotificationPermission();
      const result = await WorkbenchNative.scheduleReminder({
        id: reminder.id,
        title: reminder.title,
        triggerAt: reminder.triggerAt
      });
      setToast(
        permission.granted === false
          ? "提醒已保存，请在系统设置中允许通知"
          : result.exact
            ? "提醒已准时安排"
            : "提醒已创建，请允许精确闹钟权限"
      );
    } catch {
      setToast("提醒已保存；安装版会同步到系统通知");
    }
  };

  const removeReminder = (id) => {
    setReminders((current) => current.filter((item) => item.id !== id));
    WorkbenchNative.cancelReminder({ id }).catch(() => {});
    setToast("提醒已删除");
  };

  const toggleReminder = (id) => {
    setReminders((current) => current.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, done: !item.done };
      if (next.done) WorkbenchNative.cancelReminder({ id }).catch(() => {});
      else if (next.triggerAt > Date.now()) WorkbenchNative.scheduleReminder(next).catch(() => {});
      return next;
    }));
  };

  return (
    <main className="app-shell">
      <aside className="desktop-rail" aria-label="主要导航">
        <div className="brand-mark" aria-label="拾光">拾</div>
        <nav>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={active === id ? "active" : ""}
              onClick={() => handleNav(id)}
              type="button"
              title={label}
            >
              <Icon size={22} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <IconButton label="设置" onClick={() => handleNav("me")}><Settings size={21} /></IconButton>
      </aside>

      <section className="app-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {formatDate(now, { month: "long", day: "numeric", weekday: "long" })}
            </p>
            <h1>{active === "today" ? "晚上好，今天辛苦了" : pageTitle(active)}</h1>
          </div>
          <div className="top-actions">
            <IconButton label="搜索日记" onClick={() => setActive("journal")}>
              <Search size={21} />
            </IconButton>
            <IconButton label={`提醒${upcomingReminders.length ? `，${upcomingReminders.length} 条待处理` : ""}`} onClick={() => openTool("reminders")}>
              <Bell size={21} />
              {upcomingReminders.length > 0 && <span className="notification-dot" />}
            </IconButton>
            <button className="avatar" type="button" onClick={() => setActive("me")} aria-label="打开我的页面">
              Y
            </button>
          </div>
        </header>

        {active === "today" && (
          <TodayView
            now={now}
            entries={entries}
            tasks={tasks}
            setTasks={setTasks}
            ideas={ideas}
            setIdeas={setIdeas}
            quickMood={quickMood}
            setQuickMood={setQuickMood}
            completedTasks={completedTasks}
            todayTaskCount={todayTasks.length}
            reminderCount={upcomingReminders.length}
            streak={streak}
            openComposer={openComposer}
            openTool={openTool}
            setActive={setActive}
            setToast={setToast}
          />
        )}

        {active === "journal" && (
          <JournalView
            entries={filteredEntries}
            allEntries={entries}
            setEntries={setEntries}
            query={query}
            setQuery={setQuery}
            openComposer={openComposer}
            setToast={setToast}
          />
        )}

        {active === "ledger" && (
          <LedgerView
            transactions={transactions}
            setTransactions={setTransactions}
            openLedger={() => setLedgerOpen(true)}
            openAssistant={() => setLedgerAssistantOpen(true)}
            setToast={setToast}
          />
        )}

        {active === "tools" && (
          <ToolsView
            section={toolsSection}
            setSection={setToolsSection}
            reminders={reminders}
            onSaveReminder={saveReminder}
            onRemoveReminder={removeReminder}
            onToggleReminder={toggleReminder}
            entries={entries}
            tasks={tasks}
            streak={streak}
            setToast={setToast}
          />
        )}

        {active === "me" && (
          <MeView entries={entries} streak={streak} startedAt={startedAt} setToast={setToast} openReminders={() => openTool("reminders")} />
        )}
      </section>

      {["today", "journal", "ledger"].includes(active) && (
        <button
          className="fab"
          type="button"
          onClick={active === "ledger" ? () => setLedgerOpen(true) : openComposer}
          aria-label={active === "ledger" ? "记一笔" : "写一篇日记"}
          title={active === "ledger" ? "记一笔" : "写一篇日记"}
        >
          {active === "ledger" ? <Plus size={24} /> : <PenLine size={23} />}
        </button>
      )}

      <nav className="bottom-nav" aria-label="主要导航">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={active === id ? "active" : ""}
            onClick={() => handleNav(id)}
          >
            <Icon size={21} strokeWidth={active === id ? 2.4 : 1.8} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {composerOpen && (
        <Composer
          defaultMood={quickMood}
          onClose={() => setComposerOpen(false)}
          onSave={(entry) => {
            setEntries((current) => [entry, ...current]);
            setComposerOpen(false);
            setToast("日记已安稳收好");
          }}
        />
      )}


      {ledgerOpen && (
        <TransactionComposer
          onClose={() => setLedgerOpen(false)}
          onSave={(transaction) => {
            setTransactions((current) => [transaction, ...current]);
            setLedgerOpen(false);
            setToast(transaction.type === "expense" ? "支出已记下" : "收入已记下");
          }}
        />
      )}

      {ledgerAssistantOpen && (
        <LedgerAssistant
          transactions={transactions}
          onClose={() => setLedgerAssistantOpen(false)}
          onSave={(transaction) => {
            setTransactions((current) => [transaction, ...current]);
            setToast(transaction.type === "expense" ? "AI 已帮你记下这笔支出" : "AI 已帮你记下这笔收入");
          }}
          setToast={setToast}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <Check size={18} /> {toast}
        </div>
      )}
    </main>
  );
}

function pageTitle(active) {
  return {
    journal: "我的日记",
    ledger: "日常账本",
    tools: "生活工具",
    me: "我的空间"
  }[active];
}

function TodayView({
  now,
  entries,
  tasks,
  setTasks,
  ideas,
  setIdeas,
  quickMood,
  setQuickMood,
  completedTasks,
  todayTaskCount,
  reminderCount,
  streak,
  openComposer,
  openTool,
  setActive,
  setToast
}) {
  const [newTask, setNewTask] = useState("");
  const [ideaText, setIdeaText] = useState("");
  const currentDateKey = dateKey(now);
  const [selectedTaskDate, setSelectedTaskDate] = useState(currentDateKey);
  const taskDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() + index - 2);
    return date;
  });
  const visibleTasks = tasks.filter((task) => (task.date || currentDateKey) === selectedTaskDate);
  const completedSelectedTasks = visibleTasks.filter((task) => task.done).length;

  const addTask = (event) => {
    event.preventDefault();
    const text = newTask.trim();
    if (!text) return;
    setTasks((current) => [...current, {
      id: crypto.randomUUID(),
      text,
      done: false,
      date: selectedTaskDate
    }]);
    setNewTask("");
  };

  const addIdea = (event) => {
    event.preventDefault();
    const text = ideaText.trim();
    if (!text) return;
    setIdeas((current) => [{ id: crypto.randomUUID(), text, done: false }, ...current]);
    setIdeaText("");
    setToast("灵感已放进口袋");
  };

  return (
    <div className="today-grid">
      <section className="hero-journal">
        <div className="hero-copy">
          <span className="section-kicker"><Sparkles size={15} /> 今日一页</span>
          <h2>此刻，最想记住什么？</h2>
          <p>不必完整，也不必深刻。写下一句话，就算和今天好好告别。</p>
          <div className="mood-row" aria-label="选择此刻心情">
            {moods.map((mood, index) => (
              <button
                type="button"
                key={mood.label}
                className={quickMood === index ? "selected" : ""}
                onClick={() => setQuickMood(index)}
                aria-label={mood.label}
                title={mood.label}
              >
                <span>{mood.emoji}</span>
              </button>
            ))}
          </div>
          <button className="primary-button" type="button" onClick={openComposer}>
            开始写日记 <ArrowRight size={18} />
          </button>
        </div>
        <div className="date-card" aria-hidden="true">
          <span>{formatDate(now, { month: "short" })}</span>
          <strong>{formatDate(now, { day: "2-digit" })}</strong>
          <em>DAY</em>
        </div>
      </section>

      <section className="daily-strip">
        <div className="strip-item">
          <span className="strip-icon coral"><Flame size={19} /></span>
          <div><strong>{streak} 天</strong><small>连续记录</small></div>
        </div>
        <div className="strip-divider" />
        <div className="strip-item">
          <span className="strip-icon mint"><ListChecks size={19} /></span>
          <div><strong>{completedTasks}/{todayTaskCount}</strong><small>今日待办</small></div>
        </div>
        <div className="strip-divider" />
        <div className="strip-item">
          <span className="strip-icon yellow"><AlarmClock size={19} /></span>
          <div><strong>{reminderCount}</strong><small>待提醒</small></div>
        </div>
      </section>

      <section className="panel tasks-panel">
        <div className="section-heading">
          <div>
            <span className="section-kicker"><ListChecks size={15} /> 轻计划</span>
            <h3>{selectedTaskDate === currentDateKey ? "今天要做" : "这一天要做"}</h3>
          </div>
          <span className="count-note">{completedSelectedTasks}/{visibleTasks.length} 项完成</span>
        </div>
        <div className="task-date-strip" aria-label="选择待办日期">
          {taskDates.map((date) => {
            const key = dateKey(date);
            const isToday = key === currentDateKey;
            return (
              <button
                type="button"
                key={key}
                className={selectedTaskDate === key ? "active" : ""}
                onClick={() => setSelectedTaskDate(key)}
              >
                <span>{isToday ? "今天" : formatDate(date, { weekday: "short" })}</span>
                <strong>{date.getDate()}</strong>
              </button>
            );
          })}
        </div>
        <div className="task-list">
          {visibleTasks.length === 0 && <p className="task-empty">这一天还没有安排，给自己留一点从容。</p>}
          {visibleTasks.map((task) => (
            <label className={`task-row ${task.done ? "done" : ""}`} key={task.id}>
              <input
                type="checkbox"
                checked={task.done}
                onChange={() => setTasks((current) =>
                  current.map((item) => item.id === task.id ? { ...item, done: !item.done } : item)
                )}
              />
              <span className="custom-check"><Check size={14} /></span>
              <span>{task.text}</span>
              <button
                type="button"
                aria-label={`删除${task.text}`}
                title="删除"
                onClick={(event) => {
                  event.preventDefault();
                  setTasks((current) => current.filter((item) => item.id !== task.id));
                }}
              >
                <X size={16} />
              </button>
            </label>
          ))}
        </div>
        <form className="inline-add" onSubmit={addTask}>
          <Plus size={17} />
          <input
            value={newTask}
            onChange={(event) => setNewTask(event.target.value)}
            placeholder="添加一件小事…"
            aria-label="新增待办"
          />
          <button type="submit">添加</button>
        </form>
      </section>

      <section className="feature-deck" aria-label="生活工具">
        <button type="button" className="feature-card reminder-feature" onClick={() => openTool("reminders")}>
          <span><AlarmClock size={24} /></span>
          <div><small>准时提醒</small><strong>把重要的事交给系统闹钟</strong></div>
          <ChevronRight size={18} />
        </button>
        <button type="button" className="feature-card english-feature" onClick={() => openTool("english")}>
          <span><GraduationCap size={24} /></span>
          <div><small>English Buddy</small><strong>对话、翻译与英语朗读</strong></div>
          <ChevronRight size={18} />
        </button>
      </section>

      <section className="panel ideas-panel">
        <div className="section-heading">
          <div>
            <span className="section-kicker"><Lightbulb size={15} /> 灵感口袋</span>
            <h3>先记下来再说</h3>
          </div>
          <span className="count-note">{ideas.length} 条</span>
        </div>
        <form className="idea-input" onSubmit={addIdea}>
          <input
            value={ideaText}
            onChange={(event) => setIdeaText(event.target.value)}
            placeholder="刚刚想到…"
            aria-label="记录灵感"
          />
          <button type="submit" aria-label="保存灵感" title="保存灵感"><ArrowRight size={18} /></button>
        </form>
        <div className="idea-list">
          {ideas.slice(0, 3).map((idea) => (
            <div key={idea.id}>
              <span />
              <p>{idea.text}</p>
              <button
                type="button"
                aria-label={`删除${idea.text}`}
                title="删除"
                onClick={() => setIdeas((current) => current.filter((item) => item.id !== idea.id))}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="recent-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker"><BookHeart size={15} /> 最近日记</span>
            <h3>最近的你</h3>
          </div>
          <button className="text-button" type="button" onClick={() => setActive("journal")}>全部</button>
        </div>
        <div className="recent-cards">
          {entries.slice(0, 2).map((entry) => (
            <article className="entry-preview" key={entry.id}>
              <div className="entry-meta">
                <span>{moods[entry.mood]?.emoji || "😌"}</span>
                <time>{formatDate(new Date(entry.date), { month: "short", day: "numeric" })}</time>
              </div>
              <h4>{entry.title}</h4>
              <p>{entry.body}</p>
              <div className="tag-row">
                {(entry.tags || []).map((tag) => <span key={tag}>#{tag}</span>)}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function JournalView({ entries, allEntries, setEntries, query, setQuery, openComposer, setToast }) {
  const [filter, setFilter] = useState("全部");
  const filters = ["全部", "收藏", "开心", "平静"];
  const visible = entries.filter((entry) => {
    if (filter === "收藏") return entry.favorite;
    if (filter === "开心") return entry.mood === 1 || entry.mood === 2;
    if (filter === "平静") return entry.mood === 0;
    return true;
  });

  return (
    <div className="page-stack journal-page">
      <section className="journal-toolbar">
        <label className="search-box">
          <Search size={19} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、正文或标签"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="清空搜索"><X size={16} /></button>
          )}
        </label>
        <button type="button" className="primary-button compact" onClick={openComposer}>
          <Plus size={18} /> 新日记
        </button>
      </section>

      <div className="filter-tabs" aria-label="筛选日记">
        {filters.map((item) => (
          <button
            type="button"
            key={item}
            className={filter === item ? "active" : ""}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <section className="journal-list">
        {visible.length === 0 ? (
          <EmptyState
            icon={BookHeart}
            title="这里还很安静"
            text={allEntries.length ? "换个关键词或筛选条件试试。" : "写下第一篇日记，给未来留一封信。"}
            action={<button className="primary-button compact" type="button" onClick={openComposer}>开始记录</button>}
          />
        ) : visible.map((entry) => (
          <article className="journal-entry" key={entry.id}>
            <div className="journal-date">
              <strong>{formatDate(new Date(entry.date), { day: "2-digit" })}</strong>
              <span>{formatDate(new Date(entry.date), { month: "short" })}</span>
            </div>
            <div className="journal-body">
              <div className="journal-entry-top">
                <span className="mood-badge">{moods[entry.mood]?.emoji || "😌"} {moods[entry.mood]?.label || "平静"}</span>
                <IconButton
                  label={entry.favorite ? "取消收藏" : "收藏"}
                  className={entry.favorite ? "favorite" : ""}
                  onClick={() => setEntries((current) =>
                    current.map((item) => item.id === entry.id ? { ...item, favorite: !item.favorite } : item)
                  )}
                >
                  <Heart size={18} fill={entry.favorite ? "currentColor" : "none"} />
                </IconButton>
              </div>
              <h2>{entry.title}</h2>
              <p>{entry.body}</p>
              <div className="entry-footer">
                <div className="tag-row">
                  {(entry.tags || []).map((tag) => <span key={tag}>#{tag}</span>)}
                </div>
                <IconButton
                  label="删除日记"
                  onClick={() => {
                    setEntries((current) => current.filter((item) => item.id !== entry.id));
                    setToast("这篇日记已删除");
                  }}
                >
                  <Trash2 size={17} />
                </IconButton>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function LedgerView({ transactions, setTransactions, openLedger, openAssistant, setToast }) {
  const currentMonth = dateKey(new Date()).slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [filter, setFilter] = useState("all");
  const [budget, setBudget] = usePersistentState("shiguang.monthlyBudget", 0);
  const monthTransactions = transactions
    .filter((item) => item.date.startsWith(month))
    .filter((item) => filter === "all" || item.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date));
  const allMonthTransactions = transactions.filter((item) => item.date.startsWith(month));
  const income = allMonthTransactions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const expense = allMonthTransactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const budgetPercent = Math.min(100, budget ? (expense / budget) * 100 : 0);
  const categorySummary = Object.entries(
    allMonthTransactions
      .filter((item) => item.type === "expense")
      .reduce((result, item) => {
        result[item.category] = (result[item.category] || 0) + Number(item.amount);
        return result;
      }, {})
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div className="page-stack ledger-page">
      <section className="ledger-hero">
        <div className="ledger-hero-top">
          <div>
            <span className="section-kicker"><WalletCards size={15} /> 本月结余</span>
            <strong className="balance-number">¥ {money(income - expense)}</strong>
          </div>
          <label className="month-picker">
            <CalendarDays size={16} />
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
        </div>
        <div className="money-summary">
          <div><span className="money-arrow income"><ArrowDownRight size={18} /></span><p><small>收入</small><strong>¥ {money(income)}</strong></p></div>
          <div><span className="money-arrow expense"><ArrowUpRight size={18} /></span><p><small>支出</small><strong>¥ {money(expense)}</strong></p></div>
        </div>
      </section>

      <button type="button" className="ledger-ai-card" onClick={openAssistant}>
        <span className="ledger-ai-avatar"><Sparkles size={22} /></span>
        <div>
          <strong>AI 记账助手</strong>
          <small>说“午饭 25 块”或“这个月花了多少”</small>
        </div>
        <ChevronRight size={18} />
      </button>

      <section className="panel budget-panel">
        <div className="section-heading">
          <div>
            <span className="section-kicker"><Target size={15} /> 月度预算</span>
            <h3>花得明白，也留有余地</h3>
          </div>
          <label className="budget-input">¥ <input type="number" min="0" value={budget} onChange={(event) => setBudget(Number(event.target.value) || 0)} /></label>
        </div>
        <div className="budget-track"><span style={{ width: `${budgetPercent}%` }} /></div>
        <div className="budget-caption"><span>已用 {budgetPercent.toFixed(0)}%</span><strong>剩余 ¥ {money(Math.max(0, budget - expense))}</strong></div>
      </section>

      <section className="panel category-panel">
        <div className="section-heading">
          <div>
            <span className="section-kicker"><TrendingUp size={15} /> 支出分布</span>
            <h3>钱花在了哪里</h3>
          </div>
        </div>
        {categorySummary.length ? (
          <div className="category-bars">
            {categorySummary.slice(0, 5).map(([category, value]) => (
              <div key={category}>
                <span className="category-emoji">{transactionCategoryEmoji(category)}</span>
                <div><p><strong>{category}</strong><small>¥ {money(value)}</small></p><span className="category-track"><i style={{ width: `${expense ? (value / expense) * 100 : 0}%` }} /></span></div>
              </div>
            ))}
          </div>
        ) : <p className="ledger-empty">这个月还没有支出记录。</p>}
      </section>

      <section className="transactions-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker"><ListChecks size={15} /> 流水</span>
            <h3>每一笔都算数</h3>
          </div>
          <button className="primary-button compact" type="button" onClick={openLedger}><Plus size={17} /> 记一笔</button>
        </div>
        <div className="transaction-filters">
          {[{ id: "all", label: "全部" }, { id: "expense", label: "支出" }, { id: "income", label: "收入" }].map((item) => (
            <button type="button" key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>{item.label}</button>
          ))}
        </div>
        <div className="transaction-list">
          {monthTransactions.length === 0 ? (
            <EmptyState icon={WalletCards} title="还没有流水" text="记下第一笔，让收支更清楚。" action={<button className="primary-button compact" type="button" onClick={openLedger}>记一笔</button>} />
          ) : monthTransactions.map((item) => (
            <article className="transaction-row" key={item.id}>
              <span className={`transaction-icon ${item.type}`}>{transactionCategoryEmoji(item.category)}</span>
              <div><strong>{item.note || item.category}</strong><small>{item.date} · {item.category}</small></div>
              <p className={item.type}>{item.type === "expense" ? "−" : "+"} ¥ {money(item.amount)}</p>
              <IconButton label="删除流水" onClick={() => {
                setTransactions((current) => current.filter((transaction) => transaction.id !== item.id));
                setToast("这笔流水已删除");
              }}><Trash2 size={16} /></IconButton>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function transactionCategoryEmoji(category) {
  return {
    "餐饮": "🍜",
    "交通": "🚇",
    "购物": "🛍️",
    "娱乐": "🎬",
    "居住": "🏠",
    "医疗": "💊",
    "工资": "💼",
    "奖金": "🎁",
    "其他": "🧾"
  }[category] || "🧾";
}

const LEDGER_CATEGORIES = ["餐饮", "交通", "购物", "娱乐", "居住", "医疗", "工资", "奖金", "其他"];

function buildLedgerSystemPrompt(transactions) {
  const today = dateKey(new Date());
  const recent = transactions.slice(0, 60);
  return `你是“拾光记账”的 AI 助手。当前日期是 ${today}。\n\n` +
    `预设分类（必须从中选择）：${LEDGER_CATEGORIES.join("、")}。\n\n` +
    `最近 60 条本地流水如下（JSON 数组，按时间从新到旧）：\n${JSON.stringify(recent)}\n\n` +
    `请根据用户输入返回一个 JSON 对象，不要包含任何其他解释文字。格式要求：\n` +
    `1. 若用户想记账（如“午饭 25”“今天工资 5000”）：{"action":"add","type":"expense|income","amount":数字,"category":"分类","date":"YYYY-MM-DD","note":"备注","reply":"给用户看的简短回复"}\n` +
    `2. 若用户想查账（如“这个月花了多少”“餐饮支出”）：{"action":"query","reply":"自然语言回答，基于上面的流水数据"}\n` +
    `3. 若无法识别：{"action":"unknown","reply":"可以这样说：午饭吃了 25 块，或者这个月花了多少钱"}`;
}

function parseLedgerReply(raw) {
  try {
    const text = raw.trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function LedgerAssistant({ transactions, onClose, onSave, setToast }) {
  const [apiKey, setApiKey] = usePersistentState("shiguang.ledgerApiKey", "");
  const [messages, setMessages] = usePersistentState("shiguang.ledgerMessages", []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showKey, setShowKey] = useState(!apiKey);

  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);

  const sendMessage = async (event) => {
    event.preventDefault();
    const text = input.trim();
    if (!apiKey.trim()) {
      setShowKey(true);
      return;
    }
    if (!text || loading) return;
    const userMessage = { id: crypto.randomUUID(), role: "user", text };
    const history = [...messages, userMessage];
    setMessages(history);
    setInput("");
    setLoading(true);
    try {
      const result = await WorkbenchNative.chat({
        apiKey: apiKey.trim(),
        systemPrompt: buildLedgerSystemPrompt(transactions),
        messages: history.map(({ role, text: content }) => ({ role, text: content }))
      });
      const parsed = parseLedgerReply(result.reply || "");
      let assistantText = "";
      if (parsed?.action === "add") {
        const amount = Number(parsed.amount);
        const category = LEDGER_CATEGORIES.includes(parsed.category) ? parsed.category : "其他";
        const type = parsed.type === "income" ? "income" : "expense";
        const note = String(parsed.note || "").trim();
        const date = /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : dateKey(new Date());
        if (amount > 0) {
          onSave({ id: crypto.randomUUID(), type, amount, category, note, date });
          assistantText = parsed.reply || `已帮你记下：${category} ${type === "expense" ? "−" : "+"}¥${money(amount)}`;
        } else {
          assistantText = "我没识别到金额，请再说一次，比如“午饭 25 块”";
        }
      } else if (parsed?.action === "query") {
        assistantText = parsed.reply || "已帮你查好账目";
      } else if (parsed?.action === "unknown") {
        assistantText = parsed.reply || "可以这样说：午饭吃了 25 块，或者这个月花了多少钱";
      } else {
        assistantText = result.reply?.trim() || "我没听懂，你可以说“午饭 25 块”或“这个月花了多少”";
      }
      const assistant = { id: crypto.randomUUID(), role: "assistant", text: assistantText };
      setMessages((current) => [...current, assistant]);
    } catch (error) {
      setToast(error?.message || "AI 记账请求失败，请检查网络与 API Key");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="ledger-assistant" role="dialog" aria-modal="true" aria-labelledby="ledger-assistant-title">
        <header>
          <IconButton label="关闭 AI 记账" onClick={onClose}><X size={22} /></IconButton>
          <div>
            <span>DeepSeek 驱动</span>
            <strong id="ledger-assistant-title">AI 记账助手</strong>
          </div>
          <IconButton label="管理 API Key" onClick={() => setShowKey((current) => !current)}><KeyRound size={20} /></IconButton>
        </header>

        {showKey && (
          <div className="panel api-key-card ledger-api-key">
            <div><KeyRound size={20} /><p><strong>DeepSeek API Key</strong><small>只保存在这台设备，不会写入安装包。</small></p></div>
            <label>
              <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-..." autoComplete="off" />
              <button type="button" onClick={() => setShowKey(false)}>完成</button>
            </label>
          </div>
        )}

        <div className="ledger-chat-messages">
          {messages.length === 0 && (
            <div className="ledger-welcome">
              <span><Bot size={26} /></span>
              <strong>我是你的记账小助手</strong>
              <p>直接说“午饭 25 块”“打车 18”“今天工资 5000”就能自动记账。<br />也可以问我“这个月花了多少”“餐饮支出”。</p>
            </div>
          )}
          {messages.map((message) => (
            <article className={`chat-message ${message.role}`} key={message.id}>
              <div><p>{message.text}</p></div>
            </article>
          ))}
          {loading && <div className="typing-indicator"><span /><span /><span /></div>}
        </div>

        <form className="ledger-compose" onSubmit={sendMessage}>
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="说点什么，比如午饭 25 块…" />
          <button type="submit" className="send-button" disabled={!input.trim() || loading} aria-label="发送"><Send size={19} /></button>
        </form>
      </section>
    </div>
  );
}

function TransactionComposer({ onClose, onSave }) {
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("餐饮");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(dateKey(new Date()));
  const expenseCategories = ["餐饮", "交通", "购物", "娱乐", "居住", "医疗", "其他"];
  const incomeCategories = ["工资", "奖金", "其他"];
  const categories = type === "expense" ? expenseCategories : incomeCategories;

  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);

  useEffect(() => {
    if (!categories.includes(category)) setCategory(categories[0]);
  }, [type]);

  const submit = (event) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) return;
    onSave({
      id: crypto.randomUUID(),
      type,
      amount: numericAmount,
      category,
      note: note.trim(),
      date
    });
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="transaction-composer" role="dialog" aria-modal="true" aria-labelledby="transaction-title">
        <header>
          <IconButton label="关闭记账" onClick={onClose}><X size={22} /></IconButton>
          <strong id="transaction-title">记一笔</strong>
          <span />
        </header>
        <form onSubmit={submit}>
          <div className="transaction-type-switch">
            <button type="button" className={type === "expense" ? "active" : ""} onClick={() => setType("expense")}>支出</button>
            <button type="button" className={type === "income" ? "active" : ""} onClick={() => setType("income")}>收入</button>
          </div>
          <label className="amount-field">
            <span>¥</span>
            <input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" autoFocus />
          </label>
          <div className="transaction-category-grid">
            {categories.map((item) => (
              <button type="button" key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>
                <span>{transactionCategoryEmoji(item)}</span><small>{item}</small>
              </button>
            ))}
          </div>
          <label className="transaction-form-row"><span>备注</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="这笔钱花在了…" /></label>
          <label className="transaction-form-row"><span>日期</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <button className="primary-button transaction-save" type="submit" disabled={!Number(amount)}>保存这笔记录 <Check size={18} /></button>
        </form>
      </section>
    </div>
  );
}

function ToolsView({
  section,
  setSection,
  reminders,
  onSaveReminder,
  onRemoveReminder,
  onToggleReminder,
  entries,
  tasks,
  streak,
  setToast
}) {
  const sections = [
    { id: "reminders", label: "提醒", icon: AlarmClock },
    { id: "english", label: "英语伴学", icon: GraduationCap },
    { id: "review", label: "生活回顾", icon: TrendingUp }
  ];
  return (
    <div className="page-stack tools-page">
      <div className="tool-tabs" aria-label="选择生活工具">
        {sections.map(({ id, label, icon: Icon }) => (
          <button type="button" key={id} className={section === id ? "active" : ""} onClick={() => setSection(id)}>
            <Icon size={17} /><span>{label}</span>
          </button>
        ))}
      </div>
      {section === "reminders" && (
        <ReminderView
          reminders={reminders}
          onSave={onSaveReminder}
          onRemove={onRemoveReminder}
          onToggle={onToggleReminder}
          setToast={setToast}
        />
      )}
      {section === "english" && <EnglishBuddyView setToast={setToast} />}
      {section === "review" && <ReviewView entries={entries} tasks={tasks} streak={streak} />}
    </div>
  );
}

function reminderId() {
  return Math.floor((Date.now() % 1_400_000_000) + Math.random() * 100_000);
}

function ReminderView({ reminders, onSave, onRemove, onToggle, setToast }) {
  const [naturalText, setNaturalText] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualTime, setManualTime] = useState(toLocalDateTimeValue());
  const [exactGranted, setExactGranted] = useState(true);
  const parsed = useMemo(() => parseReminderText(naturalText), [naturalText]);
  const sorted = [...reminders].sort((a, b) => a.triggerAt - b.triggerAt);

  useEffect(() => {
    WorkbenchNative.exactAlarmStatus()
      .then((result) => setExactGranted(result.granted !== false))
      .catch(() => setExactGranted(true));
  }, []);

  const addNaturalReminder = (event) => {
    event.preventDefault();
    if (!parsed) {
      setToast("没有识别到有效时间，可以改用手动设置");
      return;
    }
    onSave({ id: reminderId(), title: parsed.title, triggerAt: parsed.triggerAt, done: false });
    setNaturalText("");
  };

  const addManualReminder = (event) => {
    event.preventDefault();
    const triggerAt = new Date(manualTime).getTime();
    if (!manualTitle.trim() || !triggerAt || triggerAt <= Date.now()) {
      setToast("请填写提醒内容，并选择未来的时间");
      return;
    }
    onSave({ id: reminderId(), title: manualTitle.trim(), triggerAt, done: false });
    setManualTitle("");
    setManualTime(toLocalDateTimeValue());
  };

  return (
    <div className="reminder-page">
      <section className="reminder-hero">
        <div className="reminder-orb"><AlarmClock size={29} /></div>
        <div>
          <span className="section-kicker">自然语言提醒</span>
          <h2>一句话，交代时间和事情</h2>
          <p>支持“明天晚上八点提醒我带伞”“半小时后起来走走”等中文表达。</p>
        </div>
      </section>

      {!exactGranted && (
        <button className="exact-alarm-banner" type="button" onClick={async () => {
          await WorkbenchNative.requestExactAlarmAccess().catch(() => {});
          setToast("请在系统页面允许拾光使用精确闹钟");
        }}>
          <AlarmClock size={19} />
          <span><strong>允许精确闹钟</strong><small>未授权时系统可能延迟几分钟</small></span>
          <ChevronRight size={18} />
        </button>
      )}

      <section className="panel natural-reminder-card">
        <form onSubmit={addNaturalReminder}>
          <label>
            <MessageCircle size={19} />
            <input value={naturalText} onChange={(event) => setNaturalText(event.target.value)} placeholder="例如：明天上午九点提醒我开会" />
          </label>
          {naturalText && (
            <div className={`parse-preview ${parsed ? "valid" : ""}`}>
              {parsed ? <><Check size={15} /><span>{formatReminderTime(parsed.triggerAt)} · {parsed.title}</span></> : <><X size={15} /><span>还没识别到具体时间</span></>}
            </div>
          )}
          <button className="primary-button" type="submit" disabled={!parsed}><Plus size={18} /> 创建提醒</button>
        </form>
      </section>

      <section className="panel manual-reminder-card">
        <div className="section-heading">
          <div><span className="section-kicker">手动设置</span><h3>精确到你想要的时间</h3></div>
        </div>
        <form onSubmit={addManualReminder}>
          <input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} placeholder="提醒我做什么？" />
          <input type="datetime-local" value={manualTime} onChange={(event) => setManualTime(event.target.value)} />
          <button type="submit" className="primary-button compact">保存 <ArrowRight size={17} /></button>
        </form>
      </section>

      <section className="reminder-list-section">
        <div className="section-heading">
          <div><span className="section-kicker"><Bell size={15} /> 提醒清单</span><h3>接下来别忘了</h3></div>
          <span className="count-note">{reminders.filter((item) => !item.done && item.triggerAt > Date.now()).length} 条待提醒</span>
        </div>
        <div className="reminder-list">
          {sorted.length === 0 ? (
            <EmptyState icon={AlarmClock} title="还没有提醒" text="创建一条提醒，到点后系统会响铃并发送通知。" />
          ) : sorted.map((reminder) => {
            const past = reminder.triggerAt <= Date.now();
            return (
              <article className={`reminder-row ${reminder.done || past ? "done" : ""}`} key={reminder.id}>
                <button type="button" className="reminder-check" onClick={() => onToggle(reminder.id)} aria-label={reminder.done ? "标记未完成" : "标记完成"}>
                  {reminder.done ? <Check size={16} /> : <span />}
                </button>
                <div><strong>{reminder.title}</strong><small>{formatReminderTime(reminder.triggerAt)}{past && !reminder.done ? " · 已到期" : ""}</small></div>
                <IconButton label="删除提醒" onClick={() => onRemove(reminder.id)}><Trash2 size={16} /></IconButton>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function parseEnglishReply(raw) {
  const marker = raw.includes("💡 纠错") ? raw.indexOf("💡 纠错") : raw.indexOf("纠错");
  if (marker < 0) return { text: raw.trim(), feedback: "" };
  const text = raw.slice(0, marker).trim();
  const correction = raw.slice(marker).replace(/^💡?\s*纠错\s*[：:]?/, "").trim();
  return { text, feedback: correction };
}

function EnglishBuddyView({ setToast }) {
  const [apiKey, setApiKey] = usePersistentState("shiguang.englishApiKey", "");
  const [messages, setMessages] = usePersistentState("shiguang.englishMessages", []);
  const [autoSpeak, setAutoSpeak] = usePersistentState("shiguang.englishAutoSpeak", false);
  const [mode, setMode] = useState("chat");
  const [showKey, setShowKey] = useState(!apiKey);
  const [input, setInput] = useState("");
  const [translationInput, setTranslationInput] = useState("");
  const [translationOutput, setTranslationOutput] = useState("");
  const [loading, setLoading] = useState(false);

  const speak = async (text, language = "en-US") => {
    if (!text) return;
    try {
      await WorkbenchNative.speak({ text, language });
    } catch {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = language;
        utterance.rate = 0.92;
        window.speechSynthesis.speak(utterance);
      } else setToast("当前设备没有可用的朗读服务");
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    const text = input.trim();
    if (!apiKey.trim()) return setShowKey(true);
    if (!text || loading) return;
    const userMessage = { id: crypto.randomUUID(), role: "user", text };
    const history = [...messages, userMessage];
    setMessages(history);
    setInput("");
    setLoading(true);
    try {
      const result = await WorkbenchNative.chat({
        apiKey: apiKey.trim(),
        messages: history.map(({ role, text: content }) => ({ role, text: content }))
      });
      const parsed = parseEnglishReply(result.reply || "");
      const assistant = { id: crypto.randomUUID(), role: "assistant", text: parsed.text, feedback: parsed.feedback };
      setMessages((current) => [...current, assistant]);
      if (autoSpeak) speak(parsed.text);
    } catch (error) {
      setToast(error?.message || "英语伴学请求失败，请检查网络与 API Key");
    } finally {
      setLoading(false);
    }
  };

  const startVoice = async () => {
    try {
      const result = await WorkbenchNative.startVoiceInput();
      if (result.text) setInput(result.text);
    } catch (error) {
      setToast(error?.message || "没有识别到英语语音");
    }
  };

  const translate = async () => {
    if (!apiKey.trim()) return setShowKey(true);
    if (!translationInput.trim() || loading) return;
    setLoading(true);
    try {
      const result = await WorkbenchNative.translate({ apiKey: apiKey.trim(), text: translationInput.trim() });
      setTranslationOutput(result.translated || "");
    } catch (error) {
      setToast(error?.message || "翻译失败，请检查网络与 API Key");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="english-page">
      <section className="english-hero">
        <div className="english-avatar"><Bot size={30} /></div>
        <div><span className="section-kicker">English Buddy</span><h2>Your private English partner.</h2><p>短对话、温柔纠错、双向翻译和系统朗读都在这里。</p></div>
        <button type="button" className="english-key-button" onClick={() => setShowKey((current) => !current)}><KeyRound size={16} /> Key</button>
      </section>

      {showKey && (
        <section className="panel api-key-card">
          <div><KeyRound size={20} /><p><strong>DeepSeek API Key</strong><small>只保存在这台设备，不会写入安装包。</small></p></div>
          <label><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-..." autoComplete="off" /><button type="button" onClick={() => setShowKey(false)}>完成</button></label>
        </section>
      )}

      <div className="english-mode-switch">
        <button type="button" className={mode === "chat" ? "active" : ""} onClick={() => setMode("chat")}><MessageCircle size={17} /> 英语对话</button>
        <button type="button" className={mode === "translate" ? "active" : ""} onClick={() => setMode("translate")}><Languages size={17} /> 双向翻译</button>
      </div>

      {mode === "chat" ? (
        <section className="english-chat-shell">
          <div className="chat-toolbar">
            <button type="button" className={autoSpeak ? "active" : ""} onClick={() => setAutoSpeak((current) => !current)}><Volume2 size={16} /> 自动朗读</button>
            <button type="button" onClick={() => setMessages([])} disabled={!messages.length}><Trash2 size={15} /> 清空</button>
          </div>
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="english-welcome"><span><Bot size={24} /></span><strong>Hi! What would you like to talk about today?</strong><p>你可以从今天发生的一件小事开始。</p></div>
            )}
            {messages.map((message) => (
              <article className={`chat-message ${message.role}`} key={message.id}>
                <div><p>{message.text}</p>{message.role === "assistant" && <button type="button" onClick={() => speak(message.text)} aria-label="朗读这条回复"><Volume2 size={15} /></button>}</div>
                {message.feedback && <small><strong>纠错</strong>{message.feedback}</small>}
              </article>
            ))}
            {loading && <div className="typing-indicator"><span /><span /><span /></div>}
          </div>
          <form className="english-compose" onSubmit={sendMessage}>
            <button type="button" onClick={startVoice} aria-label="英语语音输入"><Mic size={20} /></button>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Write or speak in English…" />
            <button type="submit" className="send-button" disabled={!input.trim() || loading} aria-label="发送"><Send size={19} /></button>
          </form>
        </section>
      ) : (
        <section className="panel translator-card">
          <div className="translator-heading"><Languages size={21} /><div><strong>自动识别中英文</strong><small>中文转英文，英文转中文</small></div></div>
          <textarea value={translationInput} onChange={(event) => setTranslationInput(event.target.value)} placeholder="输入想翻译的内容…" />
          <button type="button" className="primary-button" onClick={translate} disabled={!translationInput.trim() || loading}>{loading ? "翻译中…" : "开始翻译"}<ArrowRight size={17} /></button>
          {translationOutput && <div className="translation-result"><p>{translationOutput}</p><button type="button" onClick={() => speak(translationOutput, /[\u3400-\u9fff]/.test(translationOutput) ? "zh-CN" : "en-US")}><Volume2 size={16} /> 朗读</button></div>}
        </section>
      )}
    </div>
  );
}

function ReviewView({ entries, tasks, streak }) {
  const reviewDate = new Date();
  const monthLabel = formatDate(reviewDate, { month: "long" });
  const monthShort = new Intl.DateTimeFormat("en-US", { month: "short" }).format(reviewDate).toUpperCase();
  const monthNumber = String(reviewDate.getMonth() + 1).padStart(2, "0");
  const moodCounts = moods.map((_, moodIndex) => entries.filter((entry) => entry.mood === moodIndex).length);
  const maxMood = Math.max(...moodCounts, 1);
  const words = entries.reduce((total, entry) => total + entry.body.length, 0);

  return (
    <div className="page-stack review-page">
      <section className="review-hero">
        <div>
          <span className="section-kicker"><TrendingUp size={15} /> {monthLabel}小结</span>
          <h2>你正在认真生活</h2>
          <p>记录不是为了把每一天过得完美，而是更清楚地看见自己。</p>
        </div>
        <div className="month-stamp"><span>{monthShort}</span><strong>{monthNumber}</strong></div>
      </section>

      <section className="stat-grid">
        <div><BookHeart size={20} /><strong>{entries.length}</strong><span>篇日记</span></div>
        <div><PenLine size={20} /><strong>{words}</strong><span>个字</span></div>
        <div><Flame size={20} /><strong>{streak}</strong><span>天连续</span></div>
        <div><Check size={20} /><strong>{tasks.filter((task) => task.done).length}</strong><span>次完成</span></div>
      </section>

      <section className="panel mood-chart-panel">
        <div className="section-heading">
          <div>
            <span className="section-kicker"><SmilePlus size={15} /> 情绪光谱</span>
            <h3>这个月的心情</h3>
          </div>
        </div>
        <div className="mood-chart">
          {moods.map((mood, index) => (
            <div className="mood-bar-group" key={mood.label}>
              <div className="mood-bar-track">
                <div
                  className="mood-bar"
                  style={{ height: `${28 + (moodCounts[index] / maxMood) * 70}px`, backgroundColor: mood.color }}
                />
              </div>
              <span>{mood.emoji}</span>
              <small>{mood.label}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel reflection-panel">
        <div className="section-heading">
          <div>
            <span className="section-kicker"><Sparkles size={15} /> 温柔复盘</span>
            <h3>写给下周的三个问题</h3>
          </div>
        </div>
        <ol>
          <li><span>01</span><p>什么事情让你感到最有能量？</p></li>
          <li><span>02</span><p>哪一刻值得再认真夸夸自己？</p></li>
          <li><span>03</span><p>下周可以主动放下什么？</p></li>
        </ol>
      </section>

      <section className="insight-card">
        <span><CloudSun size={24} /></span>
        <div>
          <small>本月发现</small>
          <strong>{entries.length ? `已记录 ${entries.length} 篇日记，属于你的生活趋势正在形成。` : "这里等待你的第一条真实记录。"}</strong>
          <p>{entries.length ? "统计只基于你在本机保存的内容。" : "写下日记后，情绪与连续记录会自动汇总。"}</p>
        </div>
      </section>
    </div>
  );
}

function MeView({ entries, streak, startedAt, setToast, openReminders }) {
  return (
    <div className="page-stack me-page">
      <section className="profile-card">
        <div className="large-avatar">Y</div>
        <div>
          <span className="section-kicker">拾光第 {daysSince(startedAt)} 天</span>
          <h2>你好，生活收藏家</h2>
          <p>愿你既有前行的勇气，也有停下来感受的耐心。</p>
        </div>
      </section>

      <section className="profile-numbers">
        <div><strong>{entries.length}</strong><span>全部日记</span></div>
        <div><strong>{entries.filter((entry) => entry.favorite).length}</strong><span>珍藏时刻</span></div>
        <div><strong>{streak}</strong><span>连续天数</span></div>
      </section>

      <section className="settings-list">
        <button type="button" onClick={() => setToast("日记已使用本机存储")}>
          <span className="setting-icon green"><LockKeyhole size={20} /></span>
          <div><strong>隐私与数据</strong><small>本机保存 · 仅你可见</small></div>
          <ChevronRight size={18} />
        </button>
        <button type="button" onClick={openReminders}>
          <span className="setting-icon yellow"><Bell size={20} /></span>
          <div><strong>准时提醒</strong><small>查看与管理系统提醒</small></div>
          <ChevronRight size={18} />
        </button>
        <button type="button" onClick={() => setToast("导出功能将在云同步版本开放")}>
          <span className="setting-icon blue"><BookHeart size={20} /></span>
          <div><strong>导出与备份</strong><small>Markdown / JSON</small></div>
          <ChevronRight size={18} />
        </button>
        <button type="button" onClick={() => setToast("当前为液态玻璃主题")}>
          <span className="setting-icon coral"><Sparkles size={20} /></span>
          <div><strong>外观主题</strong><small>液态玻璃</small></div>
          <ChevronRight size={18} />
        </button>
      </section>

      <div className="privacy-note">
        <LockKeyhole size={16} />
        <p>当前版本的内容只保存在你的浏览器里。清除浏览器数据前，请记得导出备份。</p>
      </div>
    </div>
  );
}

function Composer({ defaultMood, onClose, onSave }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mood, setMood] = useState(defaultMood);
  const [tags, setTags] = useState("");

  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);

  const submit = (event) => {
    event.preventDefault();
    if (!body.trim()) return;
    onSave({
      id: crypto.randomUUID(),
      title: title.trim() || "无题的一天",
      body: body.trim(),
      mood,
      tags: tags.split(/[,，\s]+/).filter(Boolean).slice(0, 5),
      date: new Date().toISOString(),
      favorite: false
    });
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="composer" role="dialog" aria-modal="true" aria-labelledby="composer-title">
        <header>
          <IconButton label="关闭编辑器" onClick={onClose}><X size={22} /></IconButton>
          <div>
            <span>{formatDate(new Date(), { month: "long", day: "numeric", weekday: "long" })}</span>
            <strong id="composer-title">写下今天</strong>
          </div>
          <IconButton label="更多选项"><MoreHorizontal size={22} /></IconButton>
        </header>

        <form onSubmit={submit}>
          <div className="composer-moods">
            <span>此刻心情</span>
            <div>
              {moods.map((item, index) => (
                <button
                  type="button"
                  key={item.label}
                  className={mood === index ? "selected" : ""}
                  onClick={() => setMood(index)}
                  title={item.label}
                  aria-label={item.label}
                >
                  {item.emoji}
                </button>
              ))}
            </div>
          </div>
          <input
            className="composer-title-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="给今天起个标题"
            autoFocus
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={"今天发生了什么？\n有什么感受想留给未来的自己？"}
            required
          />
          <label className="tag-input">
            <Tag size={17} />
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="添加标签，用空格分隔"
            />
          </label>

          <footer>
            <div className="attachment-tools">
              <IconButton label="添加图片"><ImageIcon size={20} /></IconButton>
              <IconButton label="语音记录"><Mic size={20} /></IconButton>
              <IconButton label="添加模板"><Menu size={20} /></IconButton>
            </div>
            <span>{body.length} 字</span>
            <button className="primary-button" type="submit" disabled={!body.trim()}>
              保存日记 <Check size={18} />
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
