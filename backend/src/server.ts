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

fastify.get("/api/dashboard", async () => {
  return {
    highlight: {
      label: "Today's highlight:",
      text: "Budget review follow-up due\u2014send Q4 summary to leadership by EOD. Ask in the bar below to drill in or take action.",
    },
    meetingSummaries: [
      {
        id: "m1",
        title: "Budget review (10:00)",
        summary:
          "Q4 spend is 3% under plan. Finance to lock final numbers by Friday. Marketing requested a 5% increase for next quarter\u2014decision deferred to leadership sync.",
      },
      {
        id: "m2",
        title: "Project Alpha sync (14:00)",
        summary:
          "Milestone 2 submitted. Design handoff next week. Follow-up needed with vendor on API access.",
      },
      {
        id: "m3",
        title: "Team standup (9:00)",
        summary:
          "No blockers. Sarah to share draft by EOD today. Reminder: timesheet sign-off due.",
      },
    ],
    followUps: [
      {
        id: "f1",
        text: "Send Q4 budget summary to leadership by EOD Friday",
        done: false,
      },
      {
        id: "f2",
        text: "Confirm API access with vendor (from Project Alpha sync)",
        done: false,
      },
      {
        id: "f3",
        text: "Review Sarah\u2019s draft when shared",
        done: false,
      },
      {
        id: "f4",
        text: "Complete timesheet sign-off",
        done: false,
      },
    ],
    todaySchedule: {
      meetingCount: 4,
      pendingApprovals: 2,
      events: [
        {
          id: "e1",
          time: "9:00",
          title: "Team Standup",
          tag: "Today",
          description:
            "Agenda: Sprint goals, blockers, wins. Notes from last standup ready.",
          actions: ["View notes", "Join"],
        },
        {
          id: "e2",
          time: "11:00",
          title: "Project review",
          tag: null,
          description:
            "Prep: Status doc shared. 2 action items carried from last review.",
          actions: ["Open deck", "Update status"],
        },
        {
          id: "e3",
          time: "2:00",
          title: "1:1 with Sarah",
          tag: null,
          description:
            "Last 1:1: Dec 12. Talking points and feedback draft ready.",
          actions: ["View agenda", "Add topic"],
        },
      ],
    },
    pendingItems: [
      {
        id: "p1",
        title: "Expense approval (3)",
        badge: "Urgent",
        description:
          "3 reports from your team awaiting approval. Due this week.",
        actions: ["Review now", "Remind later"],
      },
      {
        id: "p2",
        title: "Timesheet sign-off",
        badge: null,
        description:
          "Week of Feb 10\u201316. Payroll cutoff in 2 days.",
        actions: ["Sign off", "Open timesheet"],
      },
      {
        id: "p3",
        title: "Training due: Safety",
        badge: null,
        description:
          "Required annual training. ~15 min. Due by Mar 1.",
        actions: ["Start training", "Remind me"],
      },
      {
        id: "p4",
        title: "Submit expense report",
        badge: "Reminder",
        description:
          "Submit your expenses for reimbursement. Receipts from last trip pending.",
        actions: ["Submit now", "Remind later"],
      },
    ],
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
