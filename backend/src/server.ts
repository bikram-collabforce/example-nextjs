import Fastify from "fastify";
import cors from "@fastify/cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool, initDb } from "./db";

const JWT_SECRET = "digital-twin-secret-key-2024";

const fastify = Fastify({ logger: true });

fastify.register(cors, { origin: true });

fastify.get("/api/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

fastify.post<{ Body: { email: string; password: string } }>(
  "/api/auth/login",
  async (request, reply) => {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply.status(400).send({ error: "Email and password are required." });
    }

    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [
      email.toLowerCase().trim(),
    ]);

    if (rows.length === 0) {
      return reply.status(401).send({ error: "Invalid email or password." });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return reply.status(401).send({ error: "Invalid email or password." });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" },
    );

    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  },
);

fastify.get("/api/auth/me", async (request, reply) => {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Not authenticated." });
  }

  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as {
      id: number;
      email: string;
      name: string;
      role: string;
    };
    return { user: payload };
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token." });
  }
});

function getTimeSlot(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

fastify.get("/api/dashboard", async (request, reply) => {
  const auth = request.headers.authorization;
  let personaId: number | null = null;

  if (auth?.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: number };
      const { rows } = await pool.query(
        "SELECT persona_id FROM users WHERE id = $1",
        [payload.id],
      );
      if (rows.length > 0) personaId = rows[0].persona_id;
    } catch {
      /* fall through to default */
    }
  }

  if (!personaId) {
    const { rows } = await pool.query("SELECT id FROM personas WHERE name = 'Engineer'");
    personaId = rows[0]?.id ?? 1;
  }

  const slot = getTimeSlot();

  const [highlights, meetings, followUps, events, pending] = await Promise.all([
    pool.query(
      "SELECT label, text FROM highlights WHERE persona_id = $1 AND time_slot = $2 LIMIT 1",
      [personaId, slot],
    ),
    pool.query(
      "SELECT id, title, summary FROM meeting_summaries WHERE persona_id = $1 AND time_slot = $2 ORDER BY id",
      [personaId, slot],
    ),
    pool.query(
      "SELECT id, text, done FROM follow_ups WHERE persona_id = $1 AND time_slot = $2 ORDER BY id",
      [personaId, slot],
    ),
    pool.query(
      "SELECT id, time, title, tag, description, actions FROM schedule_events WHERE persona_id = $1 AND time_slot = $2 ORDER BY id",
      [personaId, slot],
    ),
    pool.query(
      "SELECT id, title, badge, description, actions FROM pending_items WHERE persona_id = $1 AND time_slot = $2 ORDER BY id",
      [personaId, slot],
    ),
  ]);

  const highlight = highlights.rows[0] ?? { label: "Welcome:", text: "Your dashboard is ready." };

  return {
    timeSlot: slot,
    highlight,
    meetingSummaries: meetings.rows.map((r) => ({
      id: `m${r.id}`,
      title: r.title,
      summary: r.summary,
    })),
    followUps: followUps.rows.map((r) => ({
      id: `f${r.id}`,
      text: r.text,
      done: r.done,
    })),
    todaySchedule: {
      meetingCount: events.rows.length,
      pendingApprovals: pending.rows.filter((r) => r.badge === "Urgent").length,
      events: events.rows.map((r) => ({
        id: `e${r.id}`,
        time: r.time,
        title: r.title,
        tag: r.tag,
        description: r.description,
        actions: r.actions,
      })),
    },
    pendingItems: pending.rows.map((r) => ({
      id: `p${r.id}`,
      title: r.title,
      badge: r.badge,
      description: r.description,
      actions: r.actions,
    })),
  };
});

fastify.post<{ Body: { message: string } }>("/api/chat", async (request) => {
  const { message } = request.body;
  const lower = message.toLowerCase();

  if (lower.includes("budget") || lower.includes("q4")) {
    return {
      reply:
        "The Q4 budget review showed spending 3% under plan. Finance will lock final numbers by Friday. Marketing has requested a 5% increase for next quarter, pending leadership approval.",
    };
  }
  if (lower.includes("meeting") || lower.includes("schedule") || lower.includes("today")) {
    return {
      reply:
        "You have 4 meetings today: Team Standup at 9:00, Project Review at 11:00, 1:1 with Sarah at 2:00, and 2 pending approvals to handle.",
    };
  }
  if (lower.includes("expense") || lower.includes("approval")) {
    return {
      reply:
        "You have 3 expense reports awaiting approval from your team, due this week. You also have a personal expense report pending submission with receipts from your last trip.",
    };
  }
  if (lower.includes("timesheet") || lower.includes("payroll")) {
    return {
      reply:
        "Timesheet sign-off for the week of Feb 10\u201316 is due. Payroll cutoff is in 2 days. Would you like me to open the timesheet?",
    };
  }
  if (lower.includes("alpha") || lower.includes("project")) {
    return {
      reply:
        "Project Alpha: Milestone 2 has been submitted. Design handoff is scheduled for next week. There's a pending follow-up to confirm API access with the vendor.",
    };
  }

  return {
    reply: `I can help you with your dashboard items. Try asking about your budget, meetings, expenses, timesheets, or Project Alpha. You said: "${message}"`,
  };
});

const start = async () => {
  const port = Number(process.env.PORT) || 4000;
  const host = process.env.HOST || "0.0.0.0";
  try {
    await initDb();
    fastify.log.info("Database initialized and users seeded.");
    await fastify.listen({ port, host });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
