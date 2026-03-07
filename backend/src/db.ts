import { Pool } from "pg";
import bcrypt from "bcryptjs";

const DATABASE_URL =
  "postgresql://postgres:wZvXUnfkNQnAvrrcQqwdIbVkUBAIGnjr@shortline.proxy.rlwy.net:12476/railway";

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function initDb() {
  const { rows: personaCol } = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'persona_id'
  `);
  const { rows: adminCol } = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_admin'
  `);
  if (personaCol.length === 0 || adminCol.length === 0) {
    await pool.query("DROP TABLE IF EXISTS daily_table_stats, pending_items, schedule_events, follow_ups, meeting_summaries, highlights, users, personas CASCADE");
    console.log("Dropped old tables for schema migration.");
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS personas (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      category VARCHAR(100) NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(100) NOT NULL,
      persona_id INTEGER REFERENCES personas(id),
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS highlights (
      id SERIAL PRIMARY KEY,
      persona_id INTEGER REFERENCES personas(id) NOT NULL,
      time_slot VARCHAR(20) NOT NULL,
      label VARCHAR(255) NOT NULL,
      text TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meeting_summaries (
      id SERIAL PRIMARY KEY,
      persona_id INTEGER REFERENCES personas(id) NOT NULL,
      time_slot VARCHAR(20) NOT NULL,
      title VARCHAR(255) NOT NULL,
      summary TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS follow_ups (
      id SERIAL PRIMARY KEY,
      persona_id INTEGER REFERENCES personas(id) NOT NULL,
      time_slot VARCHAR(20) NOT NULL,
      text TEXT NOT NULL,
      done BOOLEAN DEFAULT FALSE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedule_events (
      id SERIAL PRIMARY KEY,
      persona_id INTEGER REFERENCES personas(id) NOT NULL,
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
      persona_id INTEGER REFERENCES personas(id) NOT NULL,
      time_slot VARCHAR(20) NOT NULL,
      title VARCHAR(255) NOT NULL,
      badge VARCHAR(50),
      description TEXT NOT NULL,
      actions TEXT[] NOT NULL DEFAULT '{}'
    )
  `);

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

  const { rows: personaCheck } = await pool.query("SELECT COUNT(*) FROM personas");
  if (parseInt(personaCheck[0].count, 10) > 0) {
    const { rows: adminCheck } = await pool.query("SELECT id FROM users WHERE is_admin = TRUE LIMIT 1");
    if (adminCheck.length === 0) {
      const hash = await bcrypt.hash("Abcd@1234", 10);
      await pool.query(
        "INSERT INTO users (email, password, name, role, persona_id, is_admin) VALUES ($1, $2, $3, $4, NULL, TRUE) ON CONFLICT (email) DO NOTHING",
        ["admin@collabforce.com", hash, "Admin User", "Admin"],
      );
    }
    const { rows: statsCheck } = await pool.query("SELECT COUNT(*) FROM daily_table_stats");
    if (parseInt(statsCheck[0].count, 10) === 0) {
      const today = new Date().toISOString().slice(0, 10);
      const statsSeed: [string, number, number, string | null][] = [
        ["personas", 5, 0, null],
        ["users", 12, 1, "Duplicate email on insert"],
        ["highlights", 24, 0, null],
        ["meeting_summaries", 18, 2, "Invalid time_slot for persona 3"],
        ["follow_ups", 32, 0, null],
        ["schedule_events", 28, 1, "Missing required actions array"],
        ["pending_items", 22, 0, null],
      ];
      for (const [tname, processed, failed, reason] of statsSeed) {
        await pool.query(
          "INSERT INTO daily_table_stats (table_name, stat_date, processed_count, failed_count, failed_reason) VALUES ($1, $2, $3, $4, $5)",
          [tname, today, processed, failed, reason],
        );
      }
    }
    return;
  }

  await seedAll();
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
      "INSERT INTO personas (name, category) VALUES ($1, $2) RETURNING id",
      [p.name, p.category],
    );
    personaMap[p.name] = rows[0].id;
  }

  const hash = await bcrypt.hash("Abcd@1234", 10);
  const users = [
    { email: "developer@collabforce.com", name: "Alex Johnson", role: "Developer", persona: "Engineer" },
    { email: "manager@collabforce.com", name: "Sarah Mitchell", role: "Manager", persona: "Manager" },
    { email: "pm@collabforce.com", name: "David Chen", role: "Project Manager", persona: "Product Manager" },
    { email: "leadership@collabforce.com", name: "Rachel Torres", role: "SVP of Engineering", persona: "Executive" },
  ];

  for (const u of users) {
    await pool.query(
      "INSERT INTO users (email, password, name, role, persona_id, is_admin) VALUES ($1, $2, $3, $4, $5, FALSE)",
      [u.email, hash, u.name, u.role, personaMap[u.persona]],
    );
  }

  await pool.query(
    "INSERT INTO users (email, password, name, role, persona_id, is_admin) VALUES ($1, $2, $3, $4, NULL, TRUE)",
    ["admin@collabforce.com", hash, "Admin User", "Admin"],
  );

  const today = new Date().toISOString().slice(0, 10);
  const tableNames = ["personas", "users", "highlights", "meeting_summaries", "follow_ups", "schedule_events", "pending_items"];
  const statsSeed: [string, number, number, string | null][] = [
    ["personas", 5, 0, null],
    ["users", 12, 1, "Duplicate email on insert"],
    ["highlights", 24, 0, null],
    ["meeting_summaries", 18, 2, "Invalid time_slot for persona 3"],
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

  // ── ENGINEER ──
  const eng = personaMap["Engineer"];

  await seedHighlights(eng, [
    ["morning", "Attention !!!:", "3 failed builds overnight on service-auth. 2 PRs awaiting your review — one is blocking the release branch. CI pipeline has a flaky test in checkout-flow."],
    ["afternoon", "Deep work focus:", "Jira tickets auto-synced with GitHub. 2 tickets moved to In Progress. Agent detected a merge conflict in feature/payments that needs manual resolution."],
    ["evening", "Wrap-up:", "4 tasks reconciled. Agent declined 2 non-critical meetings for tomorrow's focus block. Code coverage report ready for review."],
    ["night", "Background analysis:", "Agent completed static analysis on 3 modules. 2 simple bugs auto-fixed and pushed as draft PRs. Memory leak pattern detected in user-session handler."],
  ]);

  await seedMeetings(eng, [
    ["morning", "Build Triage (8:30)", "3 failed builds in service-auth overnight. Root cause appears to be a dependency update in auth-middleware. Rollback PR drafted."],
    ["morning", "PR Review Standup (9:15)", "2 PRs pending review: payments-refactor (blocking release) and config-service-cleanup. Both have passing tests."],
    ["morning", "Sprint Planning (10:00)", "Sprint 24 capacity: 42 points. 3 carry-over stories from last sprint. New epic: API rate limiting."],
    ["afternoon", "Architecture Review (14:00)", "Reviewed proposed caching layer for product catalog. Decision: use Redis with 5-min TTL. Follow-up: benchmark write performance."],
    ["afternoon", "1:1 with Tech Lead (15:30)", "Discussed career growth path. Action: prepare tech talk proposal for next month's engineering all-hands."],
    ["evening", "Retrospective (17:00)", "Sprint 23 retro: deployment pipeline improved 40%. Pain point: flaky tests in checkout module need dedicated fix sprint."],
    ["night", "Async Code Review", "Agent reviewed 3 draft PRs. Left automated comments on code style and test coverage gaps."],
  ]);

  await seedFollowUps(eng, [
    ["morning", "Review and approve payments-refactor PR (blocking release)", false],
    ["morning", "Investigate flaky test in checkout-flow CI pipeline", false],
    ["morning", "Update Jira ticket ARCH-142 with investigation notes", false],
    ["afternoon", "Resolve merge conflict in feature/payments branch", false],
    ["afternoon", "Write unit tests for the new rate-limiting middleware", false],
    ["evening", "Review code coverage report and identify gaps", false],
    ["evening", "Prepare agenda items for tomorrow's architecture review", false],
    ["night", "Review agent's auto-fix draft PRs for correctness", false],
    ["night", "Investigate memory leak pattern in user-session handler", false],
  ]);

  await seedEvents(eng, [
    ["morning", "8:30", "Build Triage", "Urgent", "Review 3 failed builds and approve rollback PR.", ["View builds", "Open PR"]],
    ["morning", "9:15", "PR Review", null, "2 PRs awaiting review. Payments-refactor is release-blocking.", ["Open PRs", "View diff"]],
    ["morning", "10:00", "Sprint Planning", null, "Sprint 24 planning. 42 points capacity, 3 carry-overs.", ["Open board", "View backlog"]],
    ["afternoon", "14:00", "Architecture Review", null, "Redis caching proposal for product catalog.", ["View RFC", "Join"]],
    ["afternoon", "15:30", "1:1 with Tech Lead", null, "Career growth discussion and tech talk planning.", ["View notes", "Add topic"]],
    ["evening", "17:00", "Sprint Retro", null, "Sprint 23 retrospective. CI improvements review.", ["Open retro", "Add item"]],
  ]);

  await seedPending(eng, [
    ["morning", "PR Review: payments-refactor", "Urgent", "Release-blocking PR awaiting your approval. 847 lines changed across 12 files.", ["Review now", "View diff"]],
    ["morning", "Flaky Test Investigation", null, "checkout-flow test has failed 3 of last 5 runs. Needs root cause analysis.", ["View logs", "Assign"]],
    ["afternoon", "Merge Conflict Resolution", "Urgent", "feature/payments has conflicts with main. 3 files affected.", ["Resolve", "View files"]],
    ["afternoon", "Rate Limiter Tests", null, "New middleware needs unit test coverage before merge.", ["Create tests", "View spec"]],
    ["evening", "Coverage Report Review", "Reminder", "Overall coverage dropped 2% this sprint. 3 modules below threshold.", ["View report", "Remind me"]],
    ["night", "Auto-fix PRs Review", null, "Agent created 2 draft PRs with simple bug fixes. Needs human verification.", ["Review PRs", "Dismiss"]],
  ]);

  // ── ARCHITECT ──
  const arch = personaMap["Architect"];

  await seedHighlights(arch, [
    ["morning", "Priority messages:", "5 VIP DMs from senior engineers on the CMDB migration. 2 urgent architectural queries about the new event-driven pipeline."],
    ["afternoon", "Topic tracking:", "Agent surfaced 8 mentions of 'dynamic CMDB' across 4 Slack channels. Key decision pending in #platform-architecture."],
    ["evening", "Buffer window:", "2-hour deep work block secured (5:00–7:00 PM). 3 complex architectural decisions queued for review."],
    ["night", "Networking:", "Agent found 2 visiting architects from partner companies next week. Suggested coffee chats aligned with your CMDB interests."],
  ]);

  await seedMeetings(arch, [
    ["morning", "Architecture Office Hours (9:00)", "Fielded 3 questions on microservice boundaries. Recurring theme: teams confused about CMDB ownership model."],
    ["morning", "Platform Sync (10:30)", "Event-driven pipeline proposal reviewed. Consensus on Kafka over RabbitMQ. Capacity planning needed."],
    ["afternoon", "CMDB Working Group (13:00)", "Dynamic CMDB v2 schema finalized. Migration plan needs sign-off from 3 teams. Timeline: 6 weeks."],
    ["afternoon", "Design Review: Auth Service (15:00)", "Proposed OAuth2 + PKCE flow approved. Follow-up: document threat model for the new token exchange."],
    ["evening", "Cross-team Sync (17:30)", "Aligned frontend and backend teams on API contract for new dashboard. Breaking changes need 2-week migration window."],
  ]);

  await seedFollowUps(arch, [
    ["morning", "Respond to 5 VIP DMs about CMDB migration concerns", false],
    ["morning", "Draft architectural decision record (ADR) for event pipeline", false],
    ["afternoon", "Review and comment on dynamic CMDB v2 schema proposal", false],
    ["afternoon", "Document OAuth2 threat model for auth service redesign", false],
    ["evening", "Prepare API contract review notes for cross-team alignment", false],
    ["night", "Review agent-compiled comparison of visiting architects' published work", false],
  ]);

  await seedEvents(arch, [
    ["morning", "9:00", "Architecture Office Hours", "Today", "Open Q&A for engineering teams. 3 pre-submitted questions.", ["View questions", "Join"]],
    ["morning", "10:30", "Platform Sync", null, "Event pipeline proposal. Kafka vs RabbitMQ decision.", ["View RFC", "Join"]],
    ["afternoon", "13:00", "CMDB Working Group", null, "Dynamic CMDB v2 schema review and migration planning.", ["View schema", "Open doc"]],
    ["afternoon", "15:00", "Auth Design Review", null, "OAuth2 + PKCE flow review.", ["View design", "Join"]],
    ["evening", "17:30", "Cross-team API Sync", null, "API contract alignment between frontend and backend.", ["View contract", "Join"]],
  ]);

  await seedPending(arch, [
    ["morning", "VIP DMs (5)", "Urgent", "5 direct messages from senior engineers about CMDB migration blocking their sprint work.", ["Review now", "Prioritize"]],
    ["morning", "ADR Draft: Event Pipeline", null, "Architectural Decision Record needed before team can proceed with implementation.", ["Draft ADR", "View template"]],
    ["afternoon", "CMDB Schema Sign-off", "Urgent", "3 teams awaiting your approval on the v2 schema. Migration timeline depends on this.", ["Review schema", "Approve"]],
    ["evening", "API Breaking Changes", "Reminder", "2-week migration window needed. 4 teams affected.", ["View changes", "Notify teams"]],
    ["night", "Networking Opportunities", null, "2 visiting architects next week with CMDB expertise. Agent suggests coffee chats.", ["View profiles", "Schedule"]],
  ]);

  // ── PRODUCT MANAGER ──
  const pm = personaMap["Product Manager"];

  await seedHighlights(pm, [
    ["morning", "Context rebuild:", "Agent summarized 12 Slack threads and 3 email chains from meetings you missed yesterday. Key theme: customer churn concerns in Enterprise tier."],
    ["afternoon", "Research mode:", "Agent compiled competitive analysis for PRD draft. 4 key features identified from competitor launches this week."],
    ["evening", "Task review:", "Hot list: 3 items. Cold list: 7 items moved to backlog. Meeting prep brief ready for tomorrow's stakeholder review."],
    ["night", "Digest ready:", "Cross-functional update digest compiled. 5 engineering updates, 3 design reviews, 8 customer feedback items aggregated."],
  ]);

  await seedMeetings(pm, [
    ["morning", "Customer Feedback Review (9:00)", "NPS dropped 4 points for Enterprise tier. Top complaint: onboarding complexity. 3 feature requests trending."],
    ["morning", "Stakeholder Alignment (10:30)", "Q1 roadmap priorities debated. Marketing wants launch feature A, Engineering recommends tech debt sprint."],
    ["afternoon", "PRD Workshop (14:00)", "Drafted PRD for self-service onboarding flow. Key risk: API dependencies on platform team. ETA: 8 weeks."],
    ["afternoon", "Design Review (16:00)", "Reviewed 3 design options for the new dashboard. Option B selected — clean layout, lower dev effort."],
    ["evening", "Sprint Demo (17:30)", "Team demonstrated checkout optimization. 15% improvement in conversion. Stakeholders approved rollout."],
  ]);

  await seedFollowUps(pm, [
    ["morning", "Review agent-compiled summaries of 12 missed Slack threads", false],
    ["morning", "Respond to Enterprise tier churn concerns raised in feedback review", false],
    ["afternoon", "Finalize PRD for self-service onboarding based on workshop feedback", false],
    ["afternoon", "Share competitive analysis findings with design team", false],
    ["evening", "Update hot/cold task lists and share with stakeholders", false],
    ["night", "Review cross-functional digest and flag items needing response", false],
  ]);

  await seedEvents(pm, [
    ["morning", "9:00", "Customer Feedback Review", "Today", "NPS analysis and feature request triage.", ["View NPS data", "Join"]],
    ["morning", "10:30", "Stakeholder Alignment", null, "Q1 roadmap priority discussion.", ["View roadmap", "Join"]],
    ["afternoon", "14:00", "PRD Workshop", null, "Self-service onboarding PRD drafting session.", ["Open PRD", "View research"]],
    ["afternoon", "16:00", "Design Review", null, "Dashboard redesign — 3 options to evaluate.", ["View mocks", "Join"]],
    ["evening", "17:30", "Sprint Demo", null, "Checkout optimization results presentation.", ["View metrics", "Join"]],
  ]);

  await seedPending(pm, [
    ["morning", "Missed Meeting Summaries (3)", "Urgent", "3 meetings missed yesterday. Agent compiled summaries. Key decisions may need your input.", ["Review summaries", "Respond"]],
    ["morning", "Enterprise Churn Analysis", null, "NPS down 4 points. Customer success team needs your input on retention strategy.", ["View analysis", "Schedule call"]],
    ["afternoon", "PRD: Self-service Onboarding", "Reminder", "Draft due by EOW. API dependency needs confirmation from platform team.", ["Edit PRD", "Check deps"]],
    ["evening", "Stakeholder Update", null, "Weekly stakeholder email due. Agent drafted based on sprint demo results.", ["Review draft", "Send"]],
    ["night", "Customer Feedback Digest", null, "8 new feedback items aggregated. 2 match existing roadmap items.", ["View digest", "Triage"]],
  ]);

  // ── MANAGER ──
  const mgr = personaMap["Manager"];

  await seedHighlights(mgr, [
    ["morning", "Auto-approved:", "Agent approved 2 PTO requests and 1 expense report based on your policies. 1 expense flagged for manual review (over $500 threshold)."],
    ["afternoon", "Team health:", "Workload dashboard shows 2 team members at 110%+ capacity. Burnout risk detected for Jamie (3 consecutive late-night commits)."],
    ["evening", "1:1 prep:", "Agent compiled performance data, recent wins, and talking points for 3 upcoming 1:1s this week."],
    ["night", "Calendar optimization:", "Agent-to-agent negotiation found 4 mutually open slots across 6 team members' private schedules for the team retro."],
  ]);

  await seedMeetings(mgr, [
    ["morning", "Team Standup (9:00)", "All 8 team members green. Jamie flagged capacity concern. 2 blockers: API dependency and design review delay."],
    ["morning", "Hiring Sync (10:00)", "3 candidates in pipeline for senior engineer role. 1 moving to final round. Hiring committee meets Thursday."],
    ["afternoon", "1:1 with Jamie (14:00)", "Discussed workload concerns. Agreed to redistribute 2 tasks to the team. Jamie to take Friday off for recovery."],
    ["afternoon", "Budget Review (15:30)", "Team training budget 60% utilized. Remaining $12K to allocate before Q1 end. 3 conference requests pending."],
    ["evening", "Leadership Sync (17:00)", "Reported team velocity up 15%. Raised concern about cross-team dependency delays. Action: escalate to VP."],
  ]);

  await seedFollowUps(mgr, [
    ["morning", "Review manually flagged expense report ($500+ threshold)", false],
    ["morning", "Check auto-approved PTO requests and confirm coverage plan", false],
    ["afternoon", "Redistribute Jamie's 2 overflow tasks to available team members", false],
    ["afternoon", "Approve 3 pending conference/training requests within budget", false],
    ["evening", "Review agent-compiled 1:1 talking points for this week's meetings", false],
    ["night", "Confirm team retro slot from agent-negotiated calendar options", false],
  ]);

  await seedEvents(mgr, [
    ["morning", "9:00", "Team Standup", "Today", "Full team sync. 2 blockers to address.", ["View board", "Join"]],
    ["morning", "10:00", "Hiring Sync", null, "Senior engineer pipeline review.", ["View candidates", "Join"]],
    ["afternoon", "14:00", "1:1 with Jamie", null, "Workload and wellbeing check-in.", ["View notes", "1:1 doc"]],
    ["afternoon", "15:30", "Budget Review", null, "Training budget allocation before Q1 close.", ["View budget", "Join"]],
    ["evening", "17:00", "Leadership Sync", null, "Team velocity report and dependency escalation.", ["View metrics", "Join"]],
  ]);

  await seedPending(mgr, [
    ["morning", "Expense Review: Manual", "Urgent", "1 expense report over $500 threshold flagged for manual approval. Submitted by Jordan.", ["Review", "Approve"]],
    ["morning", "PTO Coverage Plan", null, "2 team members approved for PTO next week. Verify project coverage.", ["View calendar", "Assign backup"]],
    ["afternoon", "Team Capacity Alert", "Urgent", "2 members at 110%+ capacity. Jamie showing burnout signals. Needs immediate rebalancing.", ["View dashboard", "Rebalance"]],
    ["afternoon", "Training Requests (3)", null, "3 conference requests pending. $12K remaining budget.", ["Review requests", "Approve"]],
    ["evening", "Performance Review Prep", "Reminder", "Quarterly reviews due in 2 weeks. Agent compiled data for 3 direct reports.", ["View data", "Start reviews"]],
    ["night", "Team Retro Scheduling", null, "Agent found 4 open slots across all 6 members. Pick preferred time.", ["View options", "Confirm"]],
  ]);

  // ── EXECUTIVE ──
  const exec = personaMap["Executive"];

  await seedHighlights(exec, [
    ["morning", "Overnight alerts:", "2 strategic risk items flagged. Decision bottleneck in Platform team blocking 3 downstream projects. Board deck draft ready for review."],
    ["afternoon", "Stakeholder management:", "Agent managing 5 complex follow-ups from this morning's leadership meeting. Offsite venue shortlisted to 3 options."],
    ["evening", "Tomorrow prep:", "Leadership sync agenda prepared. 4 topics, 2 decision items. Pre-read materials distributed to attendees."],
    ["night", "Org metrics:", "Agent compiled cross-system metrics: Engineering velocity +12%, Customer NPS -4pts, Revenue on track. Unified report ready."],
  ]);

  await seedMeetings(exec, [
    ["morning", "Strategic Risk Review (8:00)", "2 risk items: Platform team bottleneck affecting 3 projects, and potential vendor contract issue. Mitigation plans drafted."],
    ["morning", "Board Prep (10:00)", "Q4 board deck 80% complete. Key narrative: growth vs. profitability trade-off. Need CFO alignment on financial projections."],
    ["morning", "All-Hands Prep (11:30)", "Reviewed talking points for Friday all-hands. Engineering wins highlighted. 2 org changes to announce."],
    ["afternoon", "Leadership Meeting (13:00)", "5 agenda items covered. Decision: greenlight Project Nova. Deferred: reorg proposal pending HR analysis."],
    ["afternoon", "Investor Update Call (15:00)", "Quarterly update delivered. Positive reception on ARR growth. Follow-up: detailed product roadmap for next call."],
    ["evening", "1:1 with CTO (17:00)", "Discussed engineering hiring pace and tech debt strategy. Agreed on 20% time allocation for infrastructure."],
  ]);

  await seedFollowUps(exec, [
    ["morning", "Review Platform team bottleneck and approve mitigation plan", false],
    ["morning", "Align with CFO on board deck financial projections", false],
    ["afternoon", "Sign off on Project Nova greenlight and resource allocation", false],
    ["afternoon", "Send detailed product roadmap to investor relations for next call", false],
    ["evening", "Review tomorrow's leadership sync agenda and pre-reads", false],
    ["night", "Review unified org metrics report compiled by agent", false],
  ]);

  await seedEvents(exec, [
    ["morning", "8:00", "Strategic Risk Review", "Urgent", "2 risk items requiring executive decision.", ["View risks", "Join"]],
    ["morning", "10:00", "Board Prep", null, "Q4 deck finalization with leadership team.", ["View deck", "Edit"]],
    ["morning", "11:30", "All-Hands Prep", null, "Friday all-hands talking points review.", ["View script", "Edit"]],
    ["afternoon", "13:00", "Leadership Meeting", null, "5 agenda items. 2 decisions pending.", ["View agenda", "Join"]],
    ["afternoon", "15:00", "Investor Call", null, "Quarterly investor update.", ["View deck", "Join"]],
    ["evening", "17:00", "1:1 with CTO", null, "Engineering strategy and hiring discussion.", ["View notes", "Add topic"]],
  ]);

  await seedPending(exec, [
    ["morning", "Strategic Risk: Platform Bottleneck", "Urgent", "3 downstream projects blocked. Mitigation plan needs your approval within 24h.", ["Review plan", "Approve"]],
    ["morning", "Board Deck: CFO Alignment", "Urgent", "Financial projections section needs CFO sign-off before Thursday.", ["View deck", "Schedule call"]],
    ["afternoon", "Project Nova: Resource Allocation", null, "Greenlit in leadership meeting. Need to confirm team assignments and budget.", ["Allocate", "View plan"]],
    ["afternoon", "Offsite Venue Selection", "Reminder", "3 venues shortlisted. Deadline to book: Friday.", ["View options", "Decide"]],
    ["evening", "Org Metrics Review", null, "Monthly cross-system report ready. NPS drop needs attention.", ["View report", "Discuss"]],
    ["night", "Reorg Proposal", null, "Deferred from leadership meeting. HR analysis expected by Wednesday.", ["View proposal", "Follow up"]],
  ]);

  console.log("Seeded all personas, users, and dashboard data.");
}

// ── Helper seed functions ──

async function seedHighlights(personaId: number, data: string[][]) {
  for (const [slot, label, text] of data) {
    await pool.query(
      "INSERT INTO highlights (persona_id, time_slot, label, text) VALUES ($1, $2, $3, $4)",
      [personaId, slot, label, text],
    );
  }
}

async function seedMeetings(personaId: number, data: string[][]) {
  for (const [slot, title, summary] of data) {
    await pool.query(
      "INSERT INTO meeting_summaries (persona_id, time_slot, title, summary) VALUES ($1, $2, $3, $4)",
      [personaId, slot, title, summary],
    );
  }
}

async function seedFollowUps(personaId: number, data: [string, string, boolean][]) {
  for (const [slot, text, done] of data) {
    await pool.query(
      "INSERT INTO follow_ups (persona_id, time_slot, text, done) VALUES ($1, $2, $3, $4)",
      [personaId, slot, text, done],
    );
  }
}

async function seedEvents(personaId: number, data: [string, string, string, string | null, string, string[]][]) {
  for (const [slot, time, title, tag, desc, actions] of data) {
    await pool.query(
      "INSERT INTO schedule_events (persona_id, time_slot, time, title, tag, description, actions) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [personaId, slot, time, title, tag, desc, actions],
    );
  }
}

async function seedPending(personaId: number, data: [string, string, string | null, string, string[]][]) {
  for (const [slot, title, badge, desc, actions] of data) {
    await pool.query(
      "INSERT INTO pending_items (persona_id, time_slot, title, badge, description, actions) VALUES ($1, $2, $3, $4, $5, $6)",
      [personaId, slot, title, badge, desc, actions],
    );
  }
}
