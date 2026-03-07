import { useEffect, useRef, useState, useCallback } from "react";
import type { DashboardData, ChatMessage, Integration } from "./types";
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

  const [activeView, setActiveView] = useState<"dashboard" | "statistics" | "administration">("dashboard");
  const [data, setData] = useState<DashboardData | null>(null);
  const [adminStats, setAdminStats] = useState<AdminTableStat[] | null>(null);
  const [adminStatsError, setAdminStatsError] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<Integration[] | null>(null);
  const [integrationsError, setIntegrationsError] = useState<string | null>(null);
  const [integrationModal, setIntegrationModal] = useState<Integration | null>(null);
  const [oauthForm, setOauthForm] = useState({ clientId: "", clientSecret: "", redirectUri: "", enabled: false });
  const [savingIntegration, setSavingIntegration] = useState(false);
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
    if (!token || activeView !== "statistics") return;
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
    if (!token || activeView !== "administration") return;
    setIntegrationsError(null);
    setIntegrations(null);
    fetch(`${API_BASE}/api/admin/integrations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 403) throw new Error("Access denied.");
        if (!r.ok) throw new Error("Failed to load integrations.");
        return r.json();
      })
      .then((d) => setIntegrations(d.integrations || []))
      .catch((e) => setIntegrationsError(e.message || "Failed to load integrations."));
  }, [token, activeView]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const openIntegrationEdit = useCallback((integration: Integration) => {
    setIntegrationModal(integration);
    setOauthForm({
      clientId: integration.clientId ?? "",
      clientSecret: "",
      redirectUri: integration.redirectUri ?? "",
      enabled: integration.enabled,
    });
  }, []);

  const closeIntegrationModal = useCallback(() => {
    setIntegrationModal(null);
    setOauthForm({ clientId: "", clientSecret: "", redirectUri: "", enabled: false });
  }, []);

  const saveIntegration = useCallback(async () => {
    if (!token || !integrationModal) return;
    setSavingIntegration(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/integrations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          serviceKey: integrationModal.serviceKey,
          displayName: integrationModal.displayName,
          groupName: integrationModal.groupName,
          clientId: oauthForm.clientId || undefined,
          clientSecret: oauthForm.clientSecret || undefined,
          redirectUri: oauthForm.redirectUri || undefined,
          enabled: oauthForm.enabled,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      closeIntegrationModal();
      const listRes = await fetch(`${API_BASE}/api/admin/integrations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        setIntegrations(listData.integrations || []);
      }
    } catch {
      setIntegrationsError("Failed to save integration.");
    } finally {
      setSavingIntegration(false);
    }
  }, [token, integrationModal, oauthForm, closeIntegrationModal]);

  const toggleIntegrationEnabled = useCallback(
    async (integration: Integration) => {
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE}/api/admin/integrations/enable`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            serviceKey: integration.serviceKey,
            enabled: !integration.enabled,
          }),
        });
        if (!res.ok) throw new Error("Failed to update");
        setIntegrations((prev) =>
          prev
            ? prev.map((i) =>
                i.serviceKey === integration.serviceKey ? { ...i, enabled: !i.enabled } : i,
              )
            : prev,
        );
      } catch {
        setIntegrationsError("Failed to update enable state.");
      }
    },
    [token],
  );

  useEffect(() => {
    if (!integrationModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeIntegrationModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [integrationModal, closeIntegrationModal]);

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
            <div className={styles.sidebarSection}>Admin</div>
            <button
              type="button"
              className={activeView === "statistics" ? styles.navItemActive : styles.navItem}
              onClick={() => setActiveView("statistics")}
            >
              <span className={styles.navIcon}>📈</span> Statistics
            </button>
            <button
              type="button"
              className={activeView === "administration" ? styles.navItemActive : styles.navItem}
              onClick={() => setActiveView("administration")}
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
              Pages /{" "}
              <span>
                {activeView === "statistics"
                  ? "Statistics"
                  : activeView === "administration"
                    ? "Administration"
                    : "Dashboard"}
              </span>
            </div>
            <h1 className={styles.pageTitle}>
              {activeView === "statistics"
                ? "Table statistics"
                : activeView === "administration"
                  ? "Integrations & onboarding"
                  : "Your Day at a Glance"}
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

        {activeView === "statistics" ? (
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
        ) : activeView === "administration" ? (
          <div className={styles.adminContent}>
            {integrationsError && (
              <div className={styles.adminError}>{integrationsError}</div>
            )}
            {integrations === null && !integrationsError && (
              <div className={styles.loading}>Loading integrations…</div>
            )}
            {integrations && integrations.length > 0 && (
              <div className={styles.integrationGroups}>
                {Array.from(
                  new Set(integrations.map((i) => i.groupName)),
                ).map((groupName) => (
                  <div key={groupName} className={styles.integrationGroup}>
                    <h3 className={styles.integrationGroupTitle}>{groupName}</h3>
                    <div className={styles.integrationList}>
                      {integrations
                        .filter((i) => i.groupName === groupName)
                        .map((int) => (
                          <div
                            key={int.serviceKey}
                            className={styles.integrationRow}
                          >
                            <span className={styles.integrationName}>
                              {int.displayName}
                            </span>
                            <div className={styles.integrationActions}>
                              <button
                                type="button"
                                className={styles.integrationBtn}
                                onClick={() => openIntegrationEdit(int)}
                                disabled={int.enabled}
                                title={int.enabled ? "Disable the integration first to edit" : "Edit OAuth settings"}
                              >
                                {int.hasCredentials ? "Edit" : "Add"}
                              </button>
                              <button
                                type="button"
                                className={styles.integrationBtn}
                                onClick={() => toggleIntegrationEnabled(int)}
                                disabled={!int.hasCredentials}
                                title={
                                  !int.hasCredentials
                                    ? "Configure OAuth first"
                                    : int.enabled
                                      ? "Disable"
                                      : "Enable"
                                }
                              >
                                {int.enabled ? "Disable" : "Enable"}
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {integrations && integrations.length === 0 && !integrationsError && (
              <div className={styles.adminEmpty}>No integrations configured.</div>
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

        {/* OAuth edit modal */}
        {integrationModal && (
          <div
            className={styles.modalOverlay}
            onClick={closeIntegrationModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="oauth-modal-title"
          >
            <div
              className={styles.modalContent}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="oauth-modal-title" className={styles.modalTitle}>
                OAuth — {integrationModal.displayName}
              </h2>
              <div className={styles.oauthForm}>
                <label className={styles.oauthLabel}>
                  Client ID
                  <input
                    type="text"
                    className={styles.oauthInput}
                    value={oauthForm.clientId}
                    onChange={(e) =>
                      setOauthForm((f) => ({ ...f, clientId: e.target.value }))
                    }
                    placeholder="OAuth client ID"
                  />
                </label>
                <label className={styles.oauthLabel}>
                  Client Secret
                  <input
                    type="password"
                    className={styles.oauthInput}
                    value={oauthForm.clientSecret}
                    onChange={(e) =>
                      setOauthForm((f) => ({ ...f, clientSecret: e.target.value }))
                    }
                    placeholder="Leave blank to keep existing"
                  />
                </label>
                <label className={styles.oauthLabel}>
                  Redirect URI
                  <input
                    type="text"
                    className={styles.oauthInput}
                    value={oauthForm.redirectUri}
                    onChange={(e) =>
                      setOauthForm((f) => ({ ...f, redirectUri: e.target.value }))
                    }
                    placeholder="https://..."
                  />
                </label>
                <label className={styles.oauthCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={oauthForm.enabled}
                    onChange={(e) =>
                      setOauthForm((f) => ({ ...f, enabled: e.target.checked }))
                    }
                  />
                  Enable integration
                </label>
              </div>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.modalBtnSecondary}
                  onClick={closeIntegrationModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.modalBtnPrimary}
                  onClick={saveIntegration}
                  disabled={savingIntegration}
                >
                  {savingIntegration ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
