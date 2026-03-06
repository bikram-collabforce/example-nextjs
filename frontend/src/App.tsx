import { useEffect, useRef, useState } from "react";
import type { DashboardData, ChatMessage } from "./types";
import styles from "./App.module.css";

const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? "https://employee-agent-api.up.railway.app"
    : "");

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/dashboard`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

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

  if (!data) {
    return <div className={styles.loading}>Loading dashboard…</div>;
  }

  return (
    <div className={styles.page}>
      {/* Highlight banner */}
      <div className={styles.highlight}>
        <strong>{data.highlight.label}</strong> {data.highlight.text}
      </div>

      {/* Section heading */}
      <div className={styles.sectionHeader}>Your day at a glance</div>

      {/* Four-column grid */}
      <div className={styles.grid}>
        {/* Column 1 — Yesterday's Meeting Summaries */}
        <div className={styles.column}>
          <div className={styles.columnTitle}>
            <span className={styles.columnIcon}>📋</span>
            Yesterday's Meeting summaries
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

        {/* Column 2 — Follow-ups from yesterday */}
        <div className={styles.column}>
          <div className={styles.columnTitle}>
            <span className={styles.columnIcon}>➡️</span>
            Follow-ups from yesterday
          </div>
          {data.followUps.map((f) => (
            <div key={f.id} className={styles.followUp}>
              <span className={styles.followUpArrow}>→</span>
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

        {/* Column 3 — Today at a glance */}
        <div className={styles.column}>
          <div className={styles.columnTitle}>
            <span className={styles.columnIcon}>📅</span>
            Today at a glance
          </div>
          <div>
            <div className={styles.bigNumber}>
              {data.todaySchedule.meetingCount}
            </div>
            <div className={styles.meetingMeta}>
              meetings · {data.todaySchedule.pendingApprovals} pending approvals
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
                  <a key={a} href="#">
                    {a}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Column 4 — Pending items */}
        <div className={styles.column}>
          <div className={styles.columnTitle}>
            <span className={styles.columnIcon}>⏳</span>
            Pending items
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
                  <a key={a} href="#">
                    {a}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom chat bar */}
      <div className={styles.bottomBar}>
        <div className={styles.bottomLabel}>Dashboard</div>
        <div className={styles.chatArea}>
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
              placeholder="Ask about your day…"
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
      </div>
    </div>
  );
}
