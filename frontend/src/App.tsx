import { useEffect, useRef, useState, useCallback } from "react";
import type { DashboardData, ChatMessage } from "./types";
import Login from "./Login";
import styles from "./App.module.css";

const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? "https://employee-agent-api.up.railway.app"
    : "");

interface AuthUser {
  name: string;
  email: string;
  role: string;
  isAdmin?: boolean;
}

interface AdminTableStat {
  tableName: string;
  statDate: string;
  processedCount: number;
  failedCount: number;
  failedReason: string | null;
}

const USER_PHOTOS: Record<string, string> = {
  "developer@collabforce.com": "https://randomuser.me/api/portraits/men/32.jpg",
  "manager@collabforce.com": "https://randomuser.me/api/portraits/women/44.jpg",
  "pm@collabforce.com": "https://randomuser.me/api/portraits/men/75.jpg",
  "leadership@collabforce.com": "https://randomuser.me/api/portraits/women/68.jpg",
  "admin@collabforce.com": "https://randomuser.me/api/portraits/men/1.jpg",
};

export default function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("token"),
  );
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem("user");
    return saved ? JSON.parse(saved) : null;
  });

  const [activeView, setActiveView] = useState<"dashboard" | "admin">("dashboard");
  const [data, setData] = useState<DashboardData | null>(null);
  const [adminStats, setAdminStats] = useState<AdminTableStat[] | null>(null);
  const [adminStatsError, setAdminStatsError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleLogin = useCallback((newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));
  }, []);

  const handleLogout = useCallback(() => {
    setToken(null);
    setUser(null);
    setData(null);
    setChatMessages([]);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }, []);

  useEffect(() => {
    if (!token) return;

    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("invalid");
        return r.json();
      })
      .then((d) => setUser(d.user))
      .catch(() => handleLogout());
  }, [token, handleLogout]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, [token]);

  useEffect(() => {
    if (!token || activeView !== "admin") return;
    setAdminStatsError(null);
    setAdminStats(null);
    fetch(`${API_BASE}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 403) throw new Error("Access denied.");
        if (!r.ok) throw new Error("Failed to load stats.");
        return r.json();
      })
      .then((d) => setAdminStats(d.stats))
      .catch((e) => setAdminStatsError(e.message || "Failed to load stats."));
  }, [token, activeView]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setSending(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const { reply } = await res.json();
      setChatMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: reply },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Sorry, something went wrong. Please try again.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  if (!token || !user) {
    return <Login apiBase={API_BASE} onLogin={handleLogin} />;
  }

  if (!data) {
    return <div className={styles.loading}>Loading dashboard…</div>;
  }

  return (
    <div className={styles.layout}>
      {/* ─── Sidebar ─── */}
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>⚡</span>
          Digital Twin
        </div>

        <div className={styles.sidebarSection}>Main</div>
        <button
          type="button"
          className={activeView === "dashboard" ? styles.navItemActive : styles.navItem}
          onClick={() => setActiveView("dashboard")}
        >
          <span className={styles.navIcon}>📊</span> Dashboard
        </button>
        <a className={styles.navItem} href="#">
          <span className={styles.navIcon}>💬</span> Chat
        </a>
        <a className={styles.navItem} href="#">
          <span className={styles.navIcon}>📅</span> Calendar
        </a>

        <div className={styles.sidebarSection}>Tools</div>
        <a className={styles.navItem} href="#">
          <span className={styles.navIcon}>📝</span> Notes
        </a>
        <a className={styles.navItem} href="#">
          <span className={styles.navIcon}>📁</span> Files
        </a>
        <a className={styles.navItem} href="#">
          <span className={styles.navIcon}>⚙️</span> Settings
        </a>

        {user?.isAdmin && (
          <>
            <hr className={styles.sidebarDivider} />
            <div className={styles.sidebarSection}>Administration</div>
            <button
              type="button"
              className={activeView === "admin" ? styles.navItemActive : styles.navItem}
              onClick={() => setActiveView("admin")}
            >
              <span className={styles.navIcon}>⚙️</span> Administration
            </button>
          </>
        )}

        <hr className={styles.sidebarDivider} />

        <div className={styles.sidebarFooter}>
          <div className={styles.sidebarFooterText}>
            Digital Twin v0.1<br />Your AI work assistant
          </div>
        </div>
      </aside>

      {/* ─── Main content ─── */}
      <main className={styles.main}>
        {/* Top bar */}
        <div className={styles.topBar}>
          <div>
            <div className={styles.breadcrumb}>
              Pages / <span>{activeView === "admin" ? "Administration" : "Dashboard"}</span>
            </div>
            <h1 className={styles.pageTitle}>
              {activeView === "admin" ? "Table statistics" : "Your Day at a Glance"}
            </h1>
          </div>
          <div className={styles.userMenu}>
            <img
              className={styles.userAvatar}
              src={USER_PHOTOS[user.email] || `https://randomuser.me/api/portraits/men/1.jpg`}
              alt={user.name}
            />
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user.name}</span>
              <span className={styles.userRole}>{user.role}</span>
            </div>
            <button className={styles.logoutBtn} onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        </div>

        {activeView === "admin" ? (
          <div className={styles.adminContent}>
            {adminStatsError && (
              <div className={styles.adminError}>{adminStatsError}</div>
            )}
            {adminStats === null && !adminStatsError && (
              <div className={styles.loading}>Loading stats…</div>
            )}
            {adminStats && adminStats.length > 0 && (
              <div className={styles.adminGrid}>
                {adminStats.map((stat) => (
                  <div key={stat.tableName} className={styles.adminCard}>
                    <div className={styles.adminCardTitle}>{stat.tableName}</div>
                    <div className={styles.adminStat}>
                      <span className={styles.adminStatLabel}>Daily processed</span>
                      <span className={styles.adminStatValue}>{stat.processedCount}</span>
                    </div>
                    <div className={styles.adminStat}>
                      <span className={styles.adminStatLabel}>Failed</span>
                      <span className={styles.adminStatValue}>{stat.failedCount}</span>
                    </div>
                    <div className={styles.adminStat}>
                      <span className={styles.adminStatLabel}>Failed reason</span>
                      <span className={styles.adminStatValue}>
                        {stat.failedReason || "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {adminStats && adminStats.length === 0 && !adminStatsError && (
              <div className={styles.adminEmpty}>No stats for today yet.</div>
            )}
          </div>
        ) : (
          <>
        {/* Highlight */}
        <div className={styles.highlight}>
          <strong>{data.highlight.label}</strong> {data.highlight.text}
        </div>

        {/* Chat bar */}
        <div className={styles.chatBar}>
          <div className={styles.chatLabel}>AI Assistant</div>
          {chatMessages.length > 0 && (
            <div className={styles.chatMessages}>
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={
                    msg.role === "user"
                      ? styles.chatBubbleUser
                      : styles.chatBubbleAssistant
                  }
                >
                  {msg.text}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
          <div className={styles.chatInputRow}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              className={styles.chatInput}
              placeholder="Ask about your day, meetings, expenses…"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendChat();
              }}
            />
            <button
              className={styles.sendBtn}
              onClick={sendChat}
              disabled={!chatInput.trim() || sending}
            >
              {sending ? "…" : "Send"}
            </button>
          </div>
        </div>

        {/* Four-column grid */}
        <div className={styles.grid}>
          {/* Column 1 — Yesterday's Meetings */}
          <div className={styles.column}>
            <div className={styles.columnTitle}>
              <span className={`${styles.columnIcon} ${styles.iconMeetings}`}>
                📋
              </span>
              Yesterday's Digest
            </div>
            {data.meetingSummaries.map((m) => (
              <div key={m.id} className={styles.meetingCard}>
                <div className={styles.meetingTitle}>{m.title}</div>
                <div className={styles.meetingSummary}>{m.summary}</div>
                <div className={styles.cardActions}>
                  <button className={styles.iconBtn} title="Copy">📄</button>
                  <button className={styles.iconBtn} title="Comment">💬</button>
                  <button className={styles.iconBtn} title="Save">📁</button>
                  <button className={styles.iconBtn} title="Share">↗</button>
                  <button className={styles.iconBtn} title="More">⋯</button>
                </div>
              </div>
            ))}
          </div>

          {/* Column 2 — Follow-ups */}
          <div className={styles.column}>
            <div className={styles.columnTitle}>
              <span className={`${styles.columnIcon} ${styles.iconFollowups}`}>
                ➡️
              </span>
              Follow-ups
            </div>
            {data.followUps.map((f) => (
              <div key={f.id} className={styles.followUp}>
                <span className={styles.followUpDot} />
                <div className={styles.followUpContent}>
                  <div className={styles.followUpText}>{f.text}</div>
                  <div className={styles.cardActions}>
                    <button className={styles.iconBtn} title="Done">✓</button>
                    <button className={styles.iconBtn} title="Snooze">⏰</button>
                    <button className={styles.iconBtn} title="Save">📁</button>
                    <button className={styles.iconBtn} title="Comment">💬</button>
                    <button className={styles.iconBtn} title="More">⋯</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Column 3 — Today */}
          <div className={styles.column}>
            <div className={styles.columnTitle}>
              <span className={`${styles.columnIcon} ${styles.iconToday}`}>
                📅
              </span>
              Today
            </div>
            <div>
              <div className={styles.statRow}>
                <div className={styles.bigNumber}>
                  {data.todaySchedule.meetingCount}
                </div>
                <div className={styles.meetingMeta}>
                  meetings · {data.todaySchedule.pendingApprovals} pending
                </div>
              </div>
            </div>
            {data.todaySchedule.events.map((e) => (
              <div key={e.id} className={styles.event}>
                <div className={styles.eventHeader}>
                  <span>
                    <span className={styles.eventTime}>{e.time}</span>{" "}
                    <span className={styles.eventTitle}>{e.title}</span>
                  </span>
                  {e.tag && <span className={styles.eventTag}>{e.tag}</span>}
                </div>
                <div className={styles.eventDesc}>{e.description}</div>
                <div className={styles.eventActions}>
                  {e.actions.map((a) => (
                    <a key={a} href="#">{a}</a>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Column 4 — Pending */}
          <div className={styles.column}>
            <div className={styles.columnTitle}>
              <span className={`${styles.columnIcon} ${styles.iconPending}`}>
                ⏳
              </span>
              Pending Items
            </div>
            {data.pendingItems.map((p) => (
              <div key={p.id} className={styles.pendingItem}>
                <div className={styles.pendingHeader}>
                  <span className={styles.pendingTitle}>{p.title}</span>
                  {p.badge === "Urgent" && (
                    <span className={styles.badgeUrgent}>Urgent</span>
                  )}
                  {p.badge === "Reminder" && (
                    <span className={styles.badgeReminder}>Reminder</span>
                  )}
                </div>
                <div className={styles.pendingDesc}>{p.description}</div>
                <div className={styles.pendingActions}>
                  {p.actions.map((a) => (
                    <a key={a} href="#">{a}</a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
          </>
        )}

      </main>
    </div>
  );
}
