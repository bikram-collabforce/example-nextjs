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
  const [adminSubTab, setAdminSubTab] = useState<"integrations" | "users">("integrations");
  interface PersonaOption { id: number; name: string }
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [userForm, setUserForm] = useState({ email: "", password: "", name: "", role: "", persona_id: "" });
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [createUserSuccess, setCreateUserSuccess] = useState(false);
  const [factoryResetConfirmOpen, setFactoryResetConfirmOpen] = useState(false);
  const [factoryResetLoading, setFactoryResetLoading] = useState(false);
  const [factoryResetError, setFactoryResetError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatHistory] = useState<{ id: string; title: string }[]>([
    { id: "current", title: "Current chat" },
    { id: "1", title: "Budget & Q4 review" },
    { id: "2", title: "Meeting schedule" },
    { id: "3", title: "Project Alpha" },
    { id: "4", title: "Expense reports" },
    { id: "5", title: "Timesheet sign-off" },
    { id: "6", title: "Vendor API access" },
    { id: "7", title: "Design handoff" },
    { id: "8", title: "Team standup notes" },
    { id: "9", title: "1:1 with Sarah" },
    { id: "10", title: "Pending approvals" },
    { id: "11", title: "Sprint planning" },
    { id: "12", title: "Release checklist" },
    { id: "13", title: "Customer feedback" },
    { id: "14", title: "HR policies" },
    { id: "15", title: "IT support ticket" },
  ]);
  const [activeChatId, setActiveChatId] = useState<string>("current");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const navTo = useCallback((view: "dashboard" | "statistics" | "administration") => {
    setActiveView(view);
    setMobileMenuOpen(false);
  }, []);

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
    if (!token || activeView !== "administration" || adminSubTab !== "integrations") return;
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
  }, [token, activeView, adminSubTab]);

  useEffect(() => {
    if (!token || activeView !== "administration" || adminSubTab !== "users") return;
    setFactoryResetError(null);
    fetch(`${API_BASE}/api/admin/personas`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 403) throw new Error("Access denied.");
        if (!r.ok) throw new Error("Failed to load personas.");
        return r.json();
      })
      .then((d) => setPersonas(d.personas || []))
      .catch(() => setPersonas([]));
  }, [token, activeView, adminSubTab]);

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

  const createUser = useCallback(async () => {
    if (!token) return;
    setCreateUserError(null);
    setCreateUserSuccess(false);
    if (!userForm.email.trim() || !userForm.password) {
      setCreateUserError("Email and password are required.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: userForm.email.trim(),
          password: userForm.password,
          name: userForm.name.trim() || undefined,
          role: userForm.role.trim() || undefined,
          persona_id: userForm.persona_id ? parseInt(userForm.persona_id, 10) : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateUserError(data.error || "Failed to create user.");
        return;
      }
      setCreateUserSuccess(true);
      setUserForm({ email: "", password: "", name: "", role: "", persona_id: "" });
    } catch {
      setCreateUserError("Failed to create user.");
    }
  }, [token, userForm]);

  const confirmFactoryReset = useCallback(async () => {
    if (!token) return;
    setFactoryResetError(null);
    setFactoryResetLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/factory-reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Factory reset failed.");
      }
      setFactoryResetConfirmOpen(false);
      handleLogout();
    } catch (e) {
      setFactoryResetError(e instanceof Error ? e.message : "Factory reset failed.");
    } finally {
      setFactoryResetLoading(false);
    }
  }, [token, handleLogout]);

  useEffect(() => {
    if (!integrationModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeIntegrationModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [integrationModal, closeIntegrationModal]);

  useEffect(() => {
    if (!factoryResetConfirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !factoryResetLoading) setFactoryResetConfirmOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [factoryResetConfirmOpen, factoryResetLoading]);

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
      {/* Mobile menu backdrop */}
      {mobileMenuOpen && (
        <button
          type="button"
          className={styles.sidebarBackdrop}
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close menu"
        />
      )}

      {/* ─── Sidebar ─── */}
      <aside className={`${styles.sidebar} ${mobileMenuOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>⚡</span>
          Digital Twin
        </div>

        <div className={styles.sidebarSection}>Main</div>
        <button
          type="button"
          className={activeView === "dashboard" ? styles.navItemActive : styles.navItem}
          onClick={() => navTo("dashboard")}
        >
          <span className={styles.navIcon}>📊</span> Dashboard
        </button>
        <button type="button" className={styles.navItem}>
          <span className={styles.navIcon}>📝</span> Notes
        </button>
        <button type="button" className={styles.navItem}>
          <span className={styles.navIcon}>📁</span> Files
        </button>
        <button type="button" className={styles.navItem}>
          <span className={styles.navIcon}>⚙️</span> Settings
        </button>

        {user?.isAdmin && (
          <>
            <hr className={styles.sidebarDivider} />
            <div className={styles.sidebarSection}>Admin</div>
            <button
              type="button"
              className={activeView === "statistics" ? styles.navItemActive : styles.navItem}
              onClick={() => navTo("statistics")}
            >
              <span className={styles.navIcon}>📈</span> Statistics
            </button>
            <button
              type="button"
              className={activeView === "administration" ? styles.navItemActive : styles.navItem}
              onClick={() => navTo("administration")}
            >
              <span className={styles.navIcon}>⚙️</span> Administration
            </button>
          </>
        )}

        <hr className={styles.sidebarDivider} />

        <div className={styles.sidebarChatSection}>
          <div className={styles.sidebarSection}>Chat</div>
          <button type="button" className={styles.navItem} aria-expanded="true">
            <span className={styles.navIcon}>💬</span> Chats
          </button>
          <nav className={styles.chatHistoryNav} aria-label="Chat history">
            {chatHistory.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className={activeChatId === chat.id ? styles.navSubItemActive : styles.navSubItem}
                onClick={() => setActiveChatId(chat.id)}
              >
                {chat.title}
              </button>
            ))}
          </nav>
        </div>

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
          <button
            type="button"
            className={styles.hamburgerBtn}
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            <span className={styles.hamburgerLine} />
            <span className={styles.hamburgerLine} />
            <span className={styles.hamburgerLine} />
          </button>
          <div className={styles.topBarTitleWrap}>
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
                  ? adminSubTab === "users"
                    ? "User and data management"
                    : "Integrations & onboarding"
                  : "Your Day at a Glance"}
            </h1>
          </div>
          <div className={styles.topBarRight}>
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
            <button
              type="button"
              className={styles.logoutBtn}
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
            >
              <svg className={styles.logoutIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
            </div>
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
            <div className={styles.adminSubTabs}>
              <button
                type="button"
                className={adminSubTab === "integrations" ? styles.adminSubTabActive : styles.adminSubTab}
                onClick={() => setAdminSubTab("integrations")}
              >
                Integrations
              </button>
              <button
                type="button"
                className={adminSubTab === "users" ? styles.adminSubTabActive : styles.adminSubTab}
                onClick={() => setAdminSubTab("users")}
              >
                User and data management
              </button>
            </div>
            {adminSubTab === "integrations" && (
              <>
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
              </>
            )}
            {adminSubTab === "users" && (
              <div className={styles.userManagement}>
                <section className={styles.userFormSection}>
                  <h3 className={styles.userFormTitle}>Create user</h3>
                  {createUserError && (
                    <div className={styles.adminError}>{createUserError}</div>
                  )}
                  {createUserSuccess && (
                    <div className={styles.createUserSuccess}>User created successfully.</div>
                  )}
                  <div className={styles.userForm}>
                    <label className={styles.userFormLabel}>
                      Email
                      <input
                        type="email"
                        className={styles.userFormInput}
                        value={userForm.email}
                        onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="user@example.com"
                      />
                    </label>
                    <label className={styles.userFormLabel}>
                      Password
                      <input
                        type="password"
                        className={styles.userFormInput}
                        value={userForm.password}
                        onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
                        placeholder="••••••••"
                      />
                    </label>
                    <label className={styles.userFormLabel}>
                      Name
                      <input
                        type="text"
                        className={styles.userFormInput}
                        value={userForm.name}
                        onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Display name"
                      />
                    </label>
                    <label className={styles.userFormLabel}>
                      Role
                      <input
                        type="text"
                        className={styles.userFormInput}
                        value={userForm.role}
                        onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value }))}
                        placeholder="e.g. Engineer, Manager"
                      />
                    </label>
                    <label className={styles.userFormLabel}>
                      Persona
                      <select
                        className={styles.userFormInput}
                        value={userForm.persona_id}
                        onChange={(e) => setUserForm((f) => ({ ...f, persona_id: e.target.value }))}
                      >
                        <option value="">— None —</option>
                        {personas.map((p) => (
                          <option key={p.id} value={String(p.id)}>{p.name}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className={styles.userFormSubmit}
                      onClick={createUser}
                    >
                      Create user
                    </button>
                  </div>
                </section>
                <section className={styles.factoryResetSection}>
                  <h3 className={styles.userFormTitle}>Data factory reset</h3>
                  <p className={styles.factoryResetDesc}>
                    Drop all tables, recreate the schema, and reseed with default data. You will be signed out. Use only when you need a clean slate.
                  </p>
                  {factoryResetError && (
                    <div className={styles.adminError}>{factoryResetError}</div>
                  )}
                  <button
                    type="button"
                    className={styles.factoryResetBtn}
                    onClick={() => setFactoryResetConfirmOpen(true)}
                  >
                    Factory reset (drop &amp; reseed)
                  </button>
                </section>
              </div>
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

        {/* Factory reset confirmation modal */}
        {factoryResetConfirmOpen && (
          <div
            className={styles.modalOverlay}
            onClick={() => !factoryResetLoading && setFactoryResetConfirmOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="factory-reset-modal-title"
          >
            <div
              className={styles.modalContent}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="factory-reset-modal-title" className={styles.modalTitle}>
                Confirm factory reset
              </h2>
              <p className={styles.factoryResetModalText}>
                This will <strong>delete all data</strong>, drop every table, recreate the schema, and reseed with default users and demo data. You will be signed out. This cannot be undone.
              </p>
              <p className={styles.factoryResetModalText}>
                Are you sure you want to continue?
              </p>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.modalBtnSecondary}
                  onClick={() => !factoryResetLoading && setFactoryResetConfirmOpen(false)}
                  disabled={factoryResetLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.factoryResetConfirmBtn}
                  onClick={confirmFactoryReset}
                  disabled={factoryResetLoading}
                >
                  {factoryResetLoading ? "Resetting…" : "Yes, reset everything"}
                </button>
              </div>
            </div>
          </div>
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
