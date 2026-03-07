import { useState, useCallback } from "react";
import styles from "./Login.module.css";

const DEMO_EMAILS = [
  "developer@collabforce.com",
  "manager@collabforce.com",
  "pm@collabforce.com",
  "leadership@collabforce.com",
  "admin@collabforce.com",
];
const DEMO_PASSWORD = "Abcd@1234";

interface LoginProps {
  apiBase: string;
  onLogin: (token: string, user: { name: string; email: string; role: string; isAdmin?: boolean }) => void;
}

export default function Login({ apiBase, onLogin }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [filled, setFilled] = useState<string | null>(null);

  const useEmail = useCallback((em: string) => {
    setEmail(em);
    setPassword(DEMO_PASSWORD);
    setFilled(em);
    setTimeout(() => setFilled(null), 1500);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed. Please try again.");
        return;
      }

      onLogin(data.token, data.user);
    } catch {
      setError("Unable to connect to the server. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoRow}>
          <span className={styles.logoIcon}>⚡</span>
          <span className={styles.logoText}>Digital Twin</span>
        </div>
        <p className={styles.subtitle}>Sign in to your Digital Twin Assistant</p>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="email">
            Email
          </label>
          <div className={styles.inputWrapper}>
            <span className={styles.inputIcon}>✉</span>
            <input
              id="email"
              className={styles.input}
              type="email"
              placeholder="you@collabforce.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
          </div>

          <label className={styles.label} htmlFor="password">
            Password
          </label>
          <div className={styles.inputWrapper}>
            <span className={styles.inputIcon}>🔒</span>
            <input
              id="password"
              className={styles.input}
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              className={styles.togglePassword}
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <button
            className={styles.submitBtn}
            type="submit"
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <div className={styles.demoHint}>
          <div className={styles.demoHintTitle}>Demo Credentials</div>
          <div className={styles.demoEmails}>
            {DEMO_EMAILS.map((em) => (
              <div key={em} className={styles.demoRow}>
                <code className={styles.demoEmail}>{em}</code>
                <button
                  type="button"
                  className={styles.copyBtn}
                  onClick={() => useEmail(em)}
                >
                  {filled === em ? "Filled!" : "Use"}
                </button>
              </div>
            ))}
          </div>
          <div className={styles.demoRow} style={{ marginTop: 8 }}>
            <span className={styles.demoPasswordLabel}>Password:</span>
            <code className={styles.demoEmail}>{DEMO_PASSWORD}</code>
          </div>
        </div>

        <div className={styles.footer}>© 2026 Digital Twin · CollabForce</div>
      </div>
    </div>
  );
}
