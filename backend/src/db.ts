import { Pool } from "pg";
import pgvector from "pgvector/pg";
import bcrypt from "bcryptjs";

const DATABASE_URL =
  "postgres://postgres:f6h3BuPNsNHLJg.8m37-HpRWz6nfFw25@hopper.proxy.rlwy.net:59401/railway";

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: false,
});

export async function initDb() {
  // ─── pgvector (Railway pgvector) ───
  const client = await pool.connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    await pgvector.registerTypes(client);
  } finally {
    client.release();
  }

  // ─── Persona ───
  const { rows: rpExist } = await pool.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'role_persona'",
  );
  if (rpExist.length > 0) {
    await pool.query("ALTER TABLE role_persona RENAME TO persona");
    console.log("Migrated: role_persona renamed to persona.");
  }
  const { rows: personasExist } = await pool.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'personas'",
  );
  if (personasExist.length > 0) {
    await pool.query("ALTER TABLE personas RENAME TO persona");
    console.log("Migrated: personas renamed to persona.");
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS persona (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      category VARCHAR(100) NOT NULL
    )
  `);

  // ─── Users (persona_id → persona only; no roles table) ───
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(100) NOT NULL,
      persona_id INTEGER REFERENCES persona(id),
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS persona_id INTEGER REFERENCES persona(id)");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE");
  await pool.query("ALTER TABLE users DROP COLUMN IF EXISTS role_id");
  await pool.query("DROP TABLE IF EXISTS roles");

  // ─── Dashboard tables (user_id only; no persona_id) ───
  await pool.query(`
    CREATE TABLE IF NOT EXISTS highlights (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      time_slot VARCHAR(20) NOT NULL,
      label VARCHAR(255) NOT NULL,
      text TEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meeting_summaries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      time_slot VARCHAR(20) NOT NULL,
      title VARCHAR(255) NOT NULL,
      summary TEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS follow_ups (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      time_slot VARCHAR(20) NOT NULL,
      text TEXT NOT NULL,
      done BOOLEAN DEFAULT FALSE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedule_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      time_slot VARCHAR(20) NOT NULL,
      time VARCHAR(20) NOT NULL,
      title VARCHAR(255) NOT NULL,
      tag VARCHAR(50),
      description TEXT NOT NULL,
      actions TEXT[] NOT NULL DEFAULT '{}'
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pending_items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      time_slot VARCHAR(20) NOT NULL,
      title VARCHAR(255) NOT NULL,
      badge VARCHAR(50),
      description TEXT NOT NULL,
      actions TEXT[] NOT NULL DEFAULT '{}'
    )
  `);

  // Migration: add user_id if missing; backfill from persona_id then drop persona_id
  for (const table of ["highlights", "meeting_summaries", "follow_ups", "schedule_events", "pending_items"]) {
    await pool.query(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`,
    );
  }
  await backfillDashboardUserIds();
  for (const table of ["highlights", "meeting_summaries", "follow_ups", "schedule_events", "pending_items"]) {
    await pool.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS persona_id`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_table_stats (
      id SERIAL PRIMARY KEY,
      table_name VARCHAR(100) NOT NULL,
      stat_date DATE NOT NULL,
      processed_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      failed_reason TEXT,
      UNIQUE(table_name, stat_date)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS integrations (
      id SERIAL PRIMARY KEY,
      service_key VARCHAR(80) UNIQUE NOT NULL,
      display_name VARCHAR(120) NOT NULL,
      group_name VARCHAR(80) NOT NULL,
      enabled BOOLEAN DEFAULT FALSE,
      client_id VARCHAR(512),
      client_secret TEXT,
      redirect_uri VARCHAR(512),
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // await seedIntegrationTypes();

  // user_oauth_connections: per-user tokens (integrations = app config only)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_oauth_connections (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      integration_id INTEGER NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at TIMESTAMP,
      scope VARCHAR(512),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, integration_id)
    )
  `);
  await pool.query("ALTER TABLE integrations DROP COLUMN IF EXISTS access_token");
  await pool.query("ALTER TABLE integrations DROP COLUMN IF EXISTS refresh_token");
  await pool.query("ALTER TABLE integrations DROP COLUMN IF EXISTS token_expires_at");
  await pool.query("ALTER TABLE integrations ADD COLUMN IF NOT EXISTS api_key TEXT");
  await pool.query("ALTER TABLE integrations ADD COLUMN IF NOT EXISTS webhook_secret TEXT");
  await pool.query("ALTER TABLE user_oauth_connections ADD COLUMN IF NOT EXISTS composio_connected_account_id VARCHAR(255)");

  // Ensure Gmail integration row exists (for Composio)
  await pool.query(
    `INSERT INTO integrations (service_key, display_name, group_name, enabled, updated_at)
     VALUES ('gmail', 'Gmail', 'Messaging & Email', FALSE, NOW())
     ON CONFLICT (service_key) DO NOTHING`,
  );

  // ─── Data seeding commented out ───
  // const { rows: personaCheck } = await pool.query("SELECT COUNT(*) FROM persona");
  // if (parseInt(personaCheck[0].count, 10) > 0) {
  //   const { rows: adminCheck } = await pool.query("SELECT id FROM users WHERE is_admin = TRUE LIMIT 1");
  //   if (adminCheck.length === 0) {
  //     const hash = await bcrypt.hash("Abcd@1234", 10);
  //     await pool.query(
  //       "INSERT INTO users (email, password, name, role, persona_id, is_admin) VALUES ($1, $2, $3, $4, NULL, TRUE) ON CONFLICT (email) DO NOTHING",
  //       ["admin@collabforce.org", hash, "Admin User", "Admin"],
  //     );
  //   }
  //   const { rows: statsCheck } = await pool.query("SELECT COUNT(*) FROM daily_table_stats");
  //   if (parseInt(statsCheck[0].count, 10) === 0) {
  //     const today = new Date().toISOString().slice(0, 10);
  //     const statsSeed: [string, number, number, string | null][] = [
  //       ["persona", 5, 0, null],
  //       ["users", 12, 1, "Duplicate email on insert"],
  //       ["highlights", 24, 0, null],
  //       ["meeting_summaries", 18, 2, "Invalid time_slot"],
  //       ["follow_ups", 32, 0, null],
  //       ["schedule_events", 28, 1, "Missing required actions array"],
  //       ["pending_items", 22, 0, null],
  //     ];
  //     for (const [tname, processed, failed, reason] of statsSeed) {
  //       await pool.query(
  //         "INSERT INTO daily_table_stats (table_name, stat_date, processed_count, failed_count, failed_reason) VALUES ($1, $2, $3, $4, $5)",
  //         [tname, today, processed, failed, reason],
  //       );
  //     }
  //   }
  //   const { rows: highlightsCheck } = await pool.query("SELECT COUNT(*) FROM highlights WHERE user_id IS NOT NULL");
  //   if (parseInt(highlightsCheck[0].count, 10) === 0) {
  //     const { rows: personaRows } = await pool.query("SELECT id, name FROM persona");
  //     const personaMap: Record<string, number> = {};
  //     for (const r of personaRows) personaMap[r.name] = r.id;
  //     const { rows: userRows } = await pool.query("SELECT id, persona_id FROM users WHERE persona_id IS NOT NULL");
  //     if (Object.keys(personaMap).length >= 5 && userRows.length > 0) {
  //       await seedDashboardDataForUsers(personaMap, userRows as { id: number; persona_id: number }[]);
  //       console.log("Seeded dashboard data per user (highlights, meetings, follow-ups, schedule, pending).");
  //     }
  //   }
  //   return;
  // }
  // await seedAll();
}

/** Drops all tables, then runs initDb() to recreate schema and seed. Call only with admin confirmation. */
export async function factoryReset() {
  await pool.query(`
    DROP TABLE IF EXISTS
      user_oauth_connections,
      highlights,
      meeting_summaries,
      follow_ups,
      schedule_events,
      pending_items,
      users,
      persona,
      integrations,
      daily_table_stats
    CASCADE
  `);
  console.log("Factory reset: dropped all tables. Recreating and seeding...");
  await initDb();
}

async function backfillDashboardUserIds() {
  for (const table of ["highlights", "meeting_summaries", "follow_ups", "schedule_events", "pending_items"]) {
    const { rows: personaCol } = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'persona_id'`,
      [table],
    );
    if (personaCol.length === 0) continue;
    const { rows: needBackfill } = await pool.query(
      `SELECT id, persona_id FROM ${table} WHERE user_id IS NULL AND persona_id IS NOT NULL LIMIT 5000`,
    );
    for (const row of needBackfill) {
      const { rows: u } = await pool.query(
        "SELECT id FROM users WHERE persona_id = $1 LIMIT 1",
        [row.persona_id],
      );
      if (u.length > 0) {
        await pool.query(`UPDATE ${table} SET user_id = $1 WHERE id = $2`, [u[0].id, row.id]);
      }
    }
  }
}

async function seedAll() {
  const personaMap: Record<string, number> = {};
  const personas = [
    { name: "Engineer", category: "Engineering 360" },
    { name: "Architect", category: "Collaboration / Work Intelligence" },
    { name: "Product Manager", category: "Work Intelligence" },
    { name: "Manager", category: "Team Insights / HR" },
    { name: "Executive", category: "Executive Assistance" },
  ];

  for (const p of personas) {
    const { rows } = await pool.query(
      "INSERT INTO persona (name, category) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET category = $2 RETURNING id",
      [p.name, p.category],
    );
    const id = rows[0]?.id;
    if (id) personaMap[p.name] = id;
  }

  const hash = await bcrypt.hash("Abcd@1234", 10);
  const users = [
    { email: "developer@collabforce.org", name: "Alex Johnson", role: "Developer", persona: "Engineer" },
    { email: "manager@collabforce.org", name: "Sarah Mitchell", role: "Manager", persona: "Manager" },
    { email: "pm@collabforce.org", name: "David Chen", role: "Project Manager", persona: "Product Manager" },
    { email: "leadership@collabforce.org", name: "Rachel Torres", role: "SVP of Engineering", persona: "Executive" },
  ];

  for (const u of users) {
    await pool.query(
      "INSERT INTO users (email, password, name, role, persona_id, is_admin) VALUES ($1, $2, $3, $4, $5, FALSE) ON CONFLICT (email) DO NOTHING",
      [u.email, hash, u.name, u.role, personaMap[u.persona]],
    );
  }

  await pool.query(
    "INSERT INTO users (email, password, name, role, persona_id, is_admin) VALUES ($1, $2, $3, $4, NULL, TRUE) ON CONFLICT (email) DO NOTHING",
    ["admin@collabforce.org", hash, "Admin User", "Admin"],
  );

  const today = new Date().toISOString().slice(0, 10);
  const statsSeed: [string, number, number, string | null][] = [
    ["persona", 5, 0, null],
    ["users", 12, 1, "Duplicate email on insert"],
    ["highlights", 24, 0, null],
    ["meeting_summaries", 18, 2, "Invalid time_slot"],
    ["follow_ups", 32, 0, null],
    ["schedule_events", 28, 1, "Missing required actions array"],
    ["pending_items", 22, 0, null],
  ];
  for (const [tname, processed, failed, reason] of statsSeed) {
    await pool.query(
      "INSERT INTO daily_table_stats (table_name, stat_date, processed_count, failed_count, failed_reason) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (table_name, stat_date) DO NOTHING",
      [tname, today, processed, failed, reason],
    );
  }

  const { rows: userRows } = await pool.query("SELECT id, persona_id FROM users WHERE persona_id IS NOT NULL");
  await seedDashboardDataForUsers(personaMap, userRows as { id: number; persona_id: number }[]);
  console.log("Seeded all persona, users, and dashboard data per user.");
}

async function seedIntegrationTypes() {
  const services: [string, string, string][] = [
    ["slack", "Slack Connect", "Messaging & Email"],
    ["gmail", "Gmail", "Messaging & Email"],
    ["outlook", "Outlook", "Messaging & Email"],
    ["teams", "Teams", "Messaging & Email"],
    ["voice_phone", "Voice / Phone", "Voice & Social"],
    ["whatsapp", "WhatsApp", "Voice & Social"],
    ["telegram", "Telegram", "Voice & Social"],
    ["instagram", "Instagram", "Voice & Social"],
    ["gus", "GUS", "Productivity & Dev"],
    ["jira", "Jira", "Productivity & Dev"],
    ["github", "GitHub", "Productivity & Dev"],
    ["calendar", "Calendar", "Productivity & Dev"],
    ["m365", "M365", "Productivity & Dev"],
    ["salesforce", "Salesforce", "Enterprise"],
    ["sap", "SAP", "Enterprise"],
    ["workday", "WorkDay", "Enterprise"],
    ["devops_tools", "DevOps Tools", "DevOps"],
  ];
  for (const [key, name, group] of services) {
    await pool.query(
      `INSERT INTO integrations (service_key, display_name, group_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (service_key) DO NOTHING`,
      [key, name, group],
    );
  }
}

// ── Helper seed functions ──

async function seedHighlightsForUser(userId: number, data: string[][]) {
  for (const [slot, label, text] of data) {
    await pool.query(
      "INSERT INTO highlights (user_id, time_slot, label, text) VALUES ($1, $2, $3, $4)",
      [userId, slot, label, text],
    );
  }
}

async function seedMeetingsForUser(userId: number, data: string[][]) {
  for (const [slot, title, summary] of data) {
    await pool.query(
      "INSERT INTO meeting_summaries (user_id, time_slot, title, summary) VALUES ($1, $2, $3, $4)",
      [userId, slot, title, summary],
    );
  }
}

async function seedFollowUpsForUser(userId: number, data: [string, string, boolean][]) {
  for (const [slot, text, done] of data) {
    await pool.query(
      "INSERT INTO follow_ups (user_id, time_slot, text, done) VALUES ($1, $2, $3, $4)",
      [userId, slot, text, done],
    );
  }
}

async function seedEventsForUser(
  userId: number,
  data: [string, string, string, string | null, string, string[]][],
) {
  for (const [slot, time, title, tag, desc, actions] of data) {
    await pool.query(
      "INSERT INTO schedule_events (user_id, time_slot, time, title, tag, description, actions) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [userId, slot, time, title, tag, desc, actions],
    );
  }
}

async function seedPendingForUser(
  userId: number,
  data: [string, string, string | null, string, string[]][],
) {
  for (const [slot, title, badge, desc, actions] of data) {
    await pool.query(
      "INSERT INTO pending_items (user_id, time_slot, title, badge, description, actions) VALUES ($1, $2, $3, $4, $5, $6)",
      [userId, slot, title, badge, desc, actions],
    );
  }
}

async function seedDashboardDataForUsers(
  personaMap: Record<string, number>,
  userRows: { id: number; persona_id: number }[],
) {
  const idToName: Record<number, string> = {};
  for (const [name, id] of Object.entries(personaMap)) idToName[id] = name;
  for (const user of userRows) {
    const name = idToName[user.persona_id];
    if (!name) continue;
    const userId = user.id;
    if (name === "Engineer") {
      await seedHighlightsForUser(userId, [
        ["morning", "Attention !!!:", "3 failed builds overnight on service-auth. 2 PRs awaiting your review — one is blocking the release branch. CI pipeline has a flaky test in checkout-flow."],
        ["afternoon", "Deep work focus:", "Jira tickets auto-synced with GitHub. 2 tickets moved to In Progress. Agent detected a merge conflict in feature/payments that needs manual resolution."],
        ["evening", "Wrap-up:", "4 tasks reconciled. Agent declined 2 non-critical meetings for tomorrow's focus block. Code coverage report ready for review."],
        ["night", "Background analysis:", "Agent completed static analysis on 3 modules. 2 simple bugs auto-fixed and pushed as draft PRs. Memory leak pattern detected in user-session handler."],
      ]);
      await seedMeetingsForUser(userId, [
        ["morning", "Build Triage (8:30)", "3 failed builds in service-auth overnight. Root cause appears to be a dependency update in auth-middleware. Rollback PR drafted."],
        ["morning", "PR Review Standup (9:15)", "2 PRs pending review: payments-refactor (blocking release) and config-service-cleanup. Both have passing tests."],
        ["morning", "Sprint Planning (10:00)", "Sprint 24 capacity: 42 points. 3 carry-over stories from last sprint. New epic: API rate limiting."],
        ["afternoon", "Architecture Review (14:00)", "Reviewed proposed caching layer for product catalog. Decision: use Redis with 5-min TTL. Follow-up: benchmark write performance."],
        ["afternoon", "1:1 with Tech Lead (15:30)", "Discussed career growth path. Action: prepare tech talk proposal for next month's engineering all-hands."],
        ["evening", "Retrospective (17:00)", "Sprint 23 retro: deployment pipeline improved 40%. Pain point: flaky tests in checkout module need dedicated fix sprint."],
        ["night", "Async Code Review", "Agent reviewed 3 draft PRs. Left automated comments on code style and test coverage gaps."],
      ]);
      await seedFollowUpsForUser(userId, [
        ["morning", "Review and approve payments-refactor PR (blocking release)", false],
        ["morning", "Investigate flaky test in checkout-flow CI pipeline", false],
        ["afternoon", "Resolve merge conflict in feature/payments branch", false],
        ["evening", "Review code coverage report and identify gaps", false],
        ["night", "Review agent's auto-fix draft PRs for correctness", false],
      ]);
      await seedEventsForUser(userId, [
        ["morning", "8:30", "Build Triage", "Urgent", "Review 3 failed builds and approve rollback PR.", ["View builds", "Open PR"]],
        ["morning", "9:15", "PR Review", null, "2 PRs awaiting review. Payments-refactor is release-blocking.", ["Open PRs", "View diff"]],
        ["afternoon", "14:00", "Architecture Review", null, "Redis caching proposal for product catalog.", ["View RFC", "Join"]],
        ["evening", "17:00", "Sprint Retro", null, "Sprint 23 retrospective. CI improvements review.", ["Open retro", "Add item"]],
      ]);
      await seedPendingForUser(userId, [
        ["morning", "PR Review: payments-refactor", "Urgent", "Release-blocking PR awaiting your approval. 847 lines changed across 12 files.", ["Review now", "View diff"]],
        ["afternoon", "Merge Conflict Resolution", "Urgent", "feature/payments has conflicts with main. 3 files affected.", ["Resolve", "View files"]],
        ["evening", "Coverage Report Review", "Reminder", "Overall coverage dropped 2% this sprint. 3 modules below threshold.", ["View report", "Remind me"]],
      ]);
    } else if (name === "Architect") {
      await seedHighlightsForUser(userId, [
        ["morning", "Priority messages:", "5 VIP DMs from senior engineers on the CMDB migration. 2 urgent architectural queries about the new event-driven pipeline."],
        ["afternoon", "Topic tracking:", "Agent surfaced 8 mentions of 'dynamic CMDB' across 4 Slack channels. Key decision pending in #platform-architecture."],
        ["evening", "Buffer window:", "2-hour deep work block secured (5:00–7:00 PM). 3 complex architectural decisions queued for review."],
        ["night", "Networking:", "Agent found 2 visiting architects from partner companies next week. Suggested coffee chats aligned with your CMDB interests."],
      ]);
      await seedMeetingsForUser(userId, [
        ["morning", "Architecture Office Hours (9:00)", "Fielded 3 questions on microservice boundaries. Recurring theme: teams confused about CMDB ownership model."],
        ["morning", "Platform Sync (10:30)", "Event-driven pipeline proposal reviewed. Consensus on Kafka over RabbitMQ. Capacity planning needed."],
        ["afternoon", "CMDB Working Group (13:00)", "Dynamic CMDB v2 schema finalized. Migration plan needs sign-off from 3 teams. Timeline: 6 weeks."],
      ]);
      await seedFollowUpsForUser(userId, [
        ["morning", "Respond to 5 VIP DMs about CMDB migration concerns", false],
        ["afternoon", "Review and comment on dynamic CMDB v2 schema proposal", false],
      ]);
      await seedEventsForUser(userId, [
        ["morning", "9:00", "Architecture Office Hours", "Today", "Open Q&A for engineering teams. 3 pre-submitted questions.", ["View questions", "Join"]],
        ["afternoon", "13:00", "CMDB Working Group", null, "Dynamic CMDB v2 schema review and migration planning.", ["View schema", "Open doc"]],
      ]);
      await seedPendingForUser(userId, [
        ["morning", "VIP DMs (5)", "Urgent", "5 direct messages from senior engineers about CMDB migration blocking their sprint work.", ["Review now", "Prioritize"]],
        ["afternoon", "CMDB Schema Sign-off", "Urgent", "3 teams awaiting your approval on the v2 schema. Migration timeline depends on this.", ["Review schema", "Approve"]],
      ]);
    } else if (name === "Product Manager") {
      await seedHighlightsForUser(userId, [
        ["morning", "Context rebuild:", "Agent summarized 12 Slack threads and 3 email chains from meetings you missed yesterday. Key theme: customer churn concerns in Enterprise tier."],
        ["afternoon", "Research mode:", "Agent compiled competitive analysis for PRD draft. 4 key features identified from competitor launches this week."],
        ["evening", "Task review:", "Hot list: 3 items. Cold list: 7 items moved to backlog. Meeting prep brief ready for tomorrow's stakeholder review."],
        ["night", "Digest ready:", "Cross-functional update digest compiled. 5 engineering updates, 3 design reviews, 8 customer feedback items aggregated."],
      ]);
      await seedMeetingsForUser(userId, [
        ["morning", "Customer Feedback Review (9:00)", "NPS dropped 4 points for Enterprise tier. Top complaint: onboarding complexity. 3 feature requests trending."],
        ["morning", "Stakeholder Alignment (10:30)", "Q1 roadmap priorities debated. Marketing wants launch feature A, Engineering recommends tech debt sprint."],
        ["afternoon", "PRD Workshop (14:00)", "Drafted PRD for self-service onboarding flow. Key risk: API dependencies on platform team. ETA: 8 weeks."],
      ]);
      await seedFollowUpsForUser(userId, [
        ["morning", "Review agent-compiled summaries of 12 missed Slack threads", false],
        ["afternoon", "Finalize PRD for self-service onboarding based on workshop feedback", false],
      ]);
      await seedEventsForUser(userId, [
        ["morning", "9:00", "Customer Feedback Review", "Today", "NPS analysis and feature request triage.", ["View NPS data", "Join"]],
        ["afternoon", "14:00", "PRD Workshop", null, "Self-service onboarding PRD drafting session.", ["Open PRD", "View research"]],
      ]);
      await seedPendingForUser(userId, [
        ["morning", "Missed Meeting Summaries (3)", "Urgent", "3 meetings missed yesterday. Agent compiled summaries. Key decisions may need your input.", ["Review summaries", "Respond"]],
        ["afternoon", "PRD: Self-service Onboarding", "Reminder", "Draft due by EOW. API dependency needs confirmation from platform team.", ["Edit PRD", "Check deps"]],
      ]);
    } else if (name === "Manager") {
      await seedHighlightsForUser(userId, [
        ["morning", "Auto-approved:", "Agent approved 2 PTO requests and 1 expense report based on your policies. 1 expense flagged for manual review (over $500 threshold)."],
        ["afternoon", "Team health:", "Workload dashboard shows 2 team members at 110%+ capacity. Burnout risk detected for Jamie (3 consecutive late-night commits)."],
        ["evening", "1:1 prep:", "Agent compiled performance data, recent wins, and talking points for 3 upcoming 1:1s this week."],
        ["night", "Calendar optimization:", "Agent-to-agent negotiation found 4 mutually open slots across 6 team members' private schedules for the team retro."],
      ]);
      await seedMeetingsForUser(userId, [
        ["morning", "Team Standup (9:00)", "All 8 team members green. Jamie flagged capacity concern. 2 blockers: API dependency and design review delay."],
        ["morning", "Hiring Sync (10:00)", "3 candidates in pipeline for senior engineer role. 1 moving to final round. Hiring committee meets Thursday."],
        ["afternoon", "1:1 with Jamie (14:00)", "Discussed workload concerns. Agreed to redistribute 2 tasks to the team. Jamie to take Friday off for recovery."],
      ]);
      await seedFollowUpsForUser(userId, [
        ["morning", "Review manually flagged expense report ($500+ threshold)", false],
        ["afternoon", "Redistribute Jamie's 2 overflow tasks to available team members", false],
      ]);
      await seedEventsForUser(userId, [
        ["morning", "9:00", "Team Standup", "Today", "Full team sync. 2 blockers to address.", ["View board", "Join"]],
        ["afternoon", "14:00", "1:1 with Jamie", null, "Workload and wellbeing check-in.", ["View notes", "1:1 doc"]],
      ]);
      await seedPendingForUser(userId, [
        ["morning", "Expense Review: Manual", "Urgent", "1 expense report over $500 threshold flagged for manual approval. Submitted by Jordan.", ["Review", "Approve"]],
        ["afternoon", "Team Capacity Alert", "Urgent", "2 members at 110%+ capacity. Jamie showing burnout signals. Needs immediate rebalancing.", ["View dashboard", "Rebalance"]],
      ]);
    } else if (name === "Executive") {
      await seedHighlightsForUser(userId, [
        ["morning", "Overnight alerts:", "2 strategic risk items flagged. Decision bottleneck in Platform team blocking 3 downstream projects. Board deck draft ready for review."],
        ["afternoon", "Stakeholder management:", "Agent managing 5 complex follow-ups from this morning's leadership meeting. Offsite venue shortlisted to 3 options."],
        ["evening", "Tomorrow prep:", "Leadership sync agenda prepared. 4 topics, 2 decision items. Pre-read materials distributed to attendees."],
        ["night", "Org metrics:", "Agent compiled cross-system metrics: Engineering velocity +12%, Customer NPS -4pts, Revenue on track. Unified report ready."],
      ]);
      await seedMeetingsForUser(userId, [
        ["morning", "Strategic Risk Review (8:00)", "2 risk items: Platform team bottleneck affecting 3 projects, and potential vendor contract issue. Mitigation plans drafted."],
        ["morning", "Board Prep (10:00)", "Q4 board deck 80% complete. Key narrative: growth vs. profitability trade-off. Need CFO alignment on financial projections."],
        ["afternoon", "Leadership Meeting (13:00)", "5 agenda items covered. Decision: greenlight Project Nova. Deferred: reorg proposal pending HR analysis."],
      ]);
      await seedFollowUpsForUser(userId, [
        ["morning", "Review Platform team bottleneck and approve mitigation plan", false],
        ["afternoon", "Sign off on Project Nova greenlight and resource allocation", false],
      ]);
      await seedEventsForUser(userId, [
        ["morning", "8:00", "Strategic Risk Review", "Urgent", "2 risk items requiring executive decision.", ["View risks", "Join"]],
        ["afternoon", "13:00", "Leadership Meeting", null, "5 agenda items. 2 decisions pending.", ["View agenda", "Join"]],
      ]);
      await seedPendingForUser(userId, [
        ["morning", "Strategic Risk: Platform Bottleneck", "Urgent", "3 downstream projects blocked. Mitigation plan needs your approval within 24h.", ["Review plan", "Approve"]],
        ["afternoon", "Project Nova: Resource Allocation", null, "Greenlit in leadership meeting. Need to confirm team assignments and budget.", ["Allocate", "View plan"]],
      ]);
    }
  }
}
