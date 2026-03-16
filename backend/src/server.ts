import "dotenv/config";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool, initDb, factoryReset } from "./db";

const JWT_SECRET = "digital-twin-secret-key-2024";
const COMPOSIO_BASE = "https://backend.composio.dev/api/v3";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;

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

    const isAdmin = !!user.is_admin;
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role, isAdmin },
      JWT_SECRET,
      { expiresIn: "24h" },
    );

    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, isAdmin },
    };
  },
);

fastify.get("/api/auth/me", async (request, reply) => {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Not authenticated." });
  }

  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: number };
    const { rows } = await pool.query(
      "SELECT id, email, name, role, is_admin FROM users WHERE id = $1",
      [payload.id],
    );
    if (rows.length === 0) {
      return reply.status(401).send({ error: "User not found." });
    }
    const u = rows[0];
    return {
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        isAdmin: !!u.is_admin,
      },
    };
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token." });
  }
});

fastify.get("/api/admin/stats", async (request, reply) => {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Not authenticated." });
  }

  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: number };
    const { rows: userRows } = await pool.query(
      "SELECT is_admin FROM users WHERE id = $1",
      [payload.id],
    );
    if (userRows.length === 0 || !userRows[0].is_admin) {
      return reply.status(403).send({ error: "Access denied." });
    }

    const today = new Date().toISOString().slice(0, 10);
    const { rows } = await pool.query(
      "SELECT table_name AS \"tableName\", stat_date AS \"statDate\", processed_count AS \"processedCount\", failed_count AS \"failedCount\", failed_reason AS \"failedReason\" FROM daily_table_stats WHERE stat_date = $1 ORDER BY table_name",
      [today],
    );

    return { stats: rows };
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token." });
  }
});

fastify.get("/api/integrations", async (request, reply) => {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Not authenticated." });
  }
  try {
    jwt.verify(auth.slice(7), JWT_SECRET) as { id: number };
    const { rows } = await pool.query(
      `SELECT service_key AS "serviceKey", display_name AS "displayName", group_name AS "groupName", enabled
       FROM integrations ORDER BY group_name, display_name`,
    );
    return { integrations: rows };
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token." });
  }
});

fastify.get("/api/me/connections", async (request, reply) => {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Not authenticated." });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: number };
    const { rows } = await pool.query(
      `SELECT i.service_key AS "serviceKey"
       FROM user_oauth_connections uoc
       JOIN integrations i ON i.id = uoc.integration_id
       WHERE uoc.user_id = $1`,
      [payload.id],
    );
    return { connectedServiceKeys: rows.map((r) => r.serviceKey) };
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token." });
  }
});

// ─── Composio Gmail: get Connect Link URL ───
fastify.get("/api/integrations/gmail/connect", async (request, reply) => {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Not authenticated." });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: number };
    const { rows: userRows } = await pool.query(
      "SELECT id, uuid FROM users WHERE id = $1",
      [payload.id] as unknown[],
    );
    if (userRows.length === 0) {
      return reply.status(401).send({ error: "User not found." });
    }
    let userUuid = userRows[0].uuid as string | null;
    // Only generate and persist UUID when missing; never overwrite existing
    if (!userUuid || userUuid.trim() === "") {
      userUuid = randomUUID();
      await pool.query("UPDATE users SET uuid = $1 WHERE id = $2", [userUuid, payload.id] as unknown[]);
    }
    const { rows: gmailRows } = await pool.query(
      "SELECT id, api_key, enabled FROM integrations WHERE service_key = $1",
      ["gmail"],
    );
    if (gmailRows.length === 0 || !gmailRows[0].api_key || !gmailRows[0].enabled) {
      return reply.status(400).send({ error: "Gmail integration not configured or not enabled." });
    }
    const apiKey = gmailRows[0].api_key;
    const callbackUrl = `${BACKEND_URL}/api/integrations/gmail/callback?user_id=${encodeURIComponent(userUuid)}`;

    const authRes = await fetch(`${COMPOSIO_BASE}/auth_configs?toolkit_slug=gmail&limit=5`, {
      headers: { "x-api-key": apiKey },
    });
    if (!authRes.ok) {
      fastify.log.error({ status: authRes.status }, "Composio auth_configs failed");
      return reply.status(502).send({ error: "Failed to get Gmail auth config from Composio." });
    }
    const authData = (await authRes.json()) as { items?: { id: string }[] };
    const authConfigId = authData.items?.[0]?.id;
    if (!authConfigId) {
      return reply.status(502).send({ error: "No Gmail auth config found in Composio." });
    }

    const linkRes = await fetch(`${COMPOSIO_BASE}/connected_accounts/link`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userUuid,
        auth_config_id: authConfigId,
        callback_url: callbackUrl,
      }),
    });
    if (!linkRes.ok) {
      const errText = await linkRes.text();
      fastify.log.error({ status: linkRes.status, body: errText }, "Composio link failed");
      return reply.status(502).send({ error: "Failed to create Composio connection link." });
    }
    const linkData = (await linkRes.json()) as { redirect_url?: string };
    const redirectUrl = linkData.redirect_url;
    if (!redirectUrl) {
      return reply.status(502).send({ error: "No redirect URL from Composio." });
    }
    return { redirectUrl };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Server error." });
  }
});

// ─── Composio Gmail: OAuth callback (Composio redirects here; user_id = uuid) ───
fastify.get<{ Querystring: { user_id?: string; status?: string; connected_account_id?: string } }>(
  "/api/integrations/gmail/callback",
  async (request, reply) => {
    const { user_id: userUuidParam, status, connected_account_id: composioConnectedAccountId } = request.query;
    const frontendSettings = `${FRONTEND_URL}/settings?gmail=connected`;
    if (!userUuidParam || status !== "success" || !composioConnectedAccountId) {
      return reply.redirect(`${frontendSettings}&error=callback_params`, 302);
    }
    try {
      const { rows: userRows } = await pool.query(
        "SELECT id FROM users WHERE uuid = $1",
        [userUuidParam.trim()] as unknown[],
      );
      if (userRows.length === 0) {
        return reply.redirect(`${frontendSettings}&error=user_not_found`, 302);
      }
      const userId = userRows[0].id as number;
      const { rows: gmailRows } = await pool.query(
        "SELECT id, api_key FROM integrations WHERE service_key = $1",
        ["gmail"] as unknown[],
      );
      if (gmailRows.length === 0 || !gmailRows[0].api_key) {
        return reply.redirect(`${frontendSettings}&error=integration_not_configured`, 302);
      }
      const integrationId = gmailRows[0].id;
      const apiKey = gmailRows[0].api_key;

      await pool.query(
        `INSERT INTO user_oauth_connections (user_id, integration_id, composio_connected_account_id, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, integration_id) DO UPDATE SET
           composio_connected_account_id = EXCLUDED.composio_connected_account_id,
           updated_at = NOW()`,
        [userId, integrationId, composioConnectedAccountId] as unknown[],
      );

      const triggerRes = await fetch(`${COMPOSIO_BASE}/trigger_instances/GMAIL_NEW_GMAIL_MESSAGE/upsert`, {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          connected_account_id: composioConnectedAccountId,
          trigger_config: {},
        }),
      });
      if (!triggerRes.ok) {
        fastify.log.warn({ status: triggerRes.status }, "Composio trigger create failed (connection still saved)");
      }

      return reply.redirect(frontendSettings, 302);
    } catch (err) {
      fastify.log.error(err);
      return reply.redirect(`${frontendSettings}&error=server`, 302);
    }
  },
);

// ─── Composio webhook: receive trigger events (e.g. new Gmail message) ───
fastify.get("/api/webhooks/composio", async (_request, reply) => {
  return reply.status(200).send({
    message: "Composio webhook endpoint. Composio sends POST requests here; this GET is only for testing reachability.",
    method: "GET",
    expect: "POST from Composio with trigger events",
  });
});

fastify.post("/api/webhooks/composio", async (request, reply) => {
  console.log("[Composio Webhook] POST received at", new Date().toISOString());
  const payload = request.body as Record<string, unknown>;
  const type = payload?.type as string | undefined;
  const metadata = payload?.metadata as Record<string, unknown> | undefined;
  const data = payload?.data as Record<string, unknown> | undefined;
  const triggerSlug = metadata?.trigger_slug as string | undefined;
  const composioUserId = metadata?.user_id as string | undefined;

  let ourUserId: number | null = null;
  if (composioUserId) {
    const { rows: u } = await pool.query(
      "SELECT id FROM users WHERE uuid = $1",
      [composioUserId] as unknown[],
    );
    if (u.length > 0) ourUserId = u[0].id as number;
  }

  await pool.query(
    `INSERT INTO composio_webhook_events (user_id, composio_user_id, type, trigger_slug, trigger_id, connected_account_id, metadata, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      ourUserId,
      composioUserId ?? null,
      type ?? null,
      triggerSlug ?? null,
      (metadata?.trigger_id as string) ?? null,
      (metadata?.connected_account_id as string) ?? null,
      metadata ? JSON.stringify(metadata) : null,
      data ? JSON.stringify(data) : null,
    ] as unknown[],
  );

  console.log("[Composio Webhook] Full payload:", JSON.stringify(payload, null, 2));

  if (type === "composio.trigger.message" && triggerSlug === "GMAIL_NEW_GMAIL_MESSAGE" && data) {
    const from = (data.from ?? data.sender ?? data.fromEmail ?? "—") as string;
    const subject = (data.subject ?? data.title ?? "—") as string;
    const snippet = (data.snippet ?? data.bodyPreview ?? data.preview ?? "") as string;
    const id = (data.id ?? data.messageId ?? data.message_id ?? "") as string;
    const formatted = `[Gmail] New email | From: ${from} | Subject: ${subject} | Snippet: ${String(snippet).slice(0, 120)} | Id: ${id}`;
    console.log("[Composio Webhook] " + formatted);
  }

  return reply.status(200).send({ status: "ok" });
});

// ─── VAPI: start outbound phone call to hardcoded number ───
fastify.post("/api/voice/call", async (request, reply) => {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Not authenticated." });
  }
  try {
    jwt.verify(auth.slice(7), JWT_SECRET) as { id: number };
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token." });
  }
  if (!VAPI_API_KEY || !VAPI_ASSISTANT_ID || !VAPI_PHONE_NUMBER_ID) {
    return reply.status(500).send({ error: "Voice not configured. Set VAPI_API_KEY, VAPI_ASSISTANT_ID, and VAPI_PHONE_NUMBER_ID." });
  }
  const vapiRes = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assistantId: VAPI_ASSISTANT_ID,
      phoneNumberId: VAPI_PHONE_NUMBER_ID,
      customer: { number: "+918105141239" },
      //customer: { number: "+916366533094" },
      assistantOverrides: {
        firstMessage: "Hello Bikram, you have a meeting in 2 minutes with Rampi",
      },
    }),
  });
  const vapiBody = await vapiRes.json().catch(() => ({})) as { id?: string; message?: string };
  if (!vapiRes.ok) {
    fastify.log.warn({ status: vapiRes.status, body: vapiBody }, "VAPI call failed");
    return reply.status(vapiRes.status >= 500 ? 502 : vapiRes.status).send({
      error: (vapiBody as { message?: string }).message ?? "Failed to start call.",
    });
  }
  return reply.status(200).send({ callId: vapiBody.id ?? null });
});

fastify.get("/api/admin/integrations", async (request, reply) => {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Not authenticated." });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: number };
    const { rows: userRows } = await pool.query(
      "SELECT is_admin FROM users WHERE id = $1",
      [payload.id],
    );
    if (userRows.length === 0 || !userRows[0].is_admin) {
      return reply.status(403).send({ error: "Access denied." });
    }
    const { rows } = await pool.query(
      `SELECT service_key AS "serviceKey", display_name AS "displayName", group_name AS "groupName",
              enabled, client_id AS "clientId", redirect_uri AS "redirectUri",
              CASE WHEN (client_id IS NOT NULL AND client_id != '') OR (api_key IS NOT NULL AND api_key != '') THEN true ELSE false END AS "hasCredentials",
              CASE WHEN api_key IS NOT NULL AND api_key != '' THEN true ELSE false END AS "hasApiKey"
       FROM integrations ORDER BY group_name, display_name`,
    );
    return { integrations: rows };
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token." });
  }
});

fastify.post<{
  Body: {
    serviceKey: string;
    displayName?: string;
    groupName?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    enabled?: boolean;
    apiKey?: string;
    webhookSecret?: string;
  };
}>("/api/admin/integrations", async (request, reply) => {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Not authenticated." });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: number };
    const { rows: userRows } = await pool.query(
      "SELECT is_admin FROM users WHERE id = $1",
      [payload.id],
    );
    if (userRows.length === 0 || !userRows[0].is_admin) {
      return reply.status(403).send({ error: "Access denied." });
    }
    const { serviceKey, displayName, groupName, clientId, clientSecret, redirectUri, enabled, apiKey, webhookSecret } = request.body;
    if (!serviceKey) {
      return reply.status(400).send({ error: "serviceKey is required." });
    }
    const sk = String(serviceKey);
    await pool.query(
      `INSERT INTO integrations (service_key, display_name, group_name, enabled, client_id, client_secret, redirect_uri, api_key, webhook_secret, updated_at)
       VALUES ($1::varchar, COALESCE(NULLIF($2, ''), $1)::varchar, COALESCE(NULLIF($3, ''), 'Other')::varchar, $4::boolean, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (service_key) DO UPDATE SET
         enabled = COALESCE($4::boolean, integrations.enabled),
         client_id = COALESCE(NULLIF($5, ''), integrations.client_id),
         client_secret = CASE WHEN $6 IS NOT NULL AND $6 != '' THEN $6 ELSE integrations.client_secret END,
         redirect_uri = COALESCE(NULLIF($7, ''), integrations.redirect_uri),
         api_key = CASE WHEN $8 IS NOT NULL AND $8 != '' THEN $8 ELSE integrations.api_key END,
         webhook_secret = CASE WHEN $9 IS NOT NULL AND $9 != '' THEN $9 ELSE integrations.webhook_secret END,
         updated_at = NOW()`,
      [sk, displayName ?? null, groupName ?? null, enabled ?? false, clientId ?? null, clientSecret ?? null, redirectUri ?? null, apiKey ?? null, webhookSecret ?? null],
    );
    const { rows } = await pool.query(
      `SELECT service_key AS "serviceKey", display_name AS "displayName", group_name AS "groupName", enabled
       FROM integrations WHERE service_key = $1::varchar`,
      [sk],
    );
    return { integration: rows[0] };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Failed to save integration." });
  }
});

fastify.patch<{
  Body: { serviceKey: string; enabled: boolean };
}>("/api/admin/integrations/enable", async (request, reply) => {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Not authenticated." });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: number };
    const { rows: userRows } = await pool.query(
      "SELECT is_admin FROM users WHERE id = $1",
      [payload.id],
    );
    if (userRows.length === 0 || !userRows[0].is_admin) {
      return reply.status(403).send({ error: "Access denied." });
    }
    const { serviceKey, enabled } = request.body;
    if (!serviceKey) {
      return reply.status(400).send({ error: "serviceKey is required." });
    }
    await pool.query(
      "UPDATE integrations SET enabled = $2, updated_at = NOW() WHERE service_key = $1",
      [serviceKey, !!enabled],
    );
    return { ok: true };
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token." });
  }
});

fastify.get("/api/admin/personas", async (request, reply) => {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Not authenticated." });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: number };
    const { rows: userRows } = await pool.query(
      "SELECT is_admin FROM users WHERE id = $1",
      [payload.id],
    );
    if (userRows.length === 0 || !userRows[0].is_admin) {
      return reply.status(403).send({ error: "Access denied." });
    }
    const { rows } = await pool.query(
      'SELECT id, name FROM persona ORDER BY name',
    );
    return { personas: rows };
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token." });
  }
});

fastify.get<{
  Querystring: { page?: string; limit?: string };
}>("/api/admin/users", async (request, reply) => {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Not authenticated." });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: number };
    const { rows: userRows } = await pool.query(
      "SELECT is_admin FROM users WHERE id = $1",
      [payload.id],
    );
    if (userRows.length === 0 || !userRows[0].is_admin) {
      return reply.status(403).send({ error: "Access denied." });
    }
    const page = Math.max(1, parseInt(request.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(request.query.limit || "10", 10)));
    const offset = (page - 1) * limit;
    const [countRes, usersRes] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS total FROM users"),
      pool.query(
        `SELECT u.id, u.email, u.name, u.role, u.persona_id AS "personaId", u.is_admin AS "isAdmin", u.uuid
         FROM users u ORDER BY u.email LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
    ]);
    const total = countRes.rows[0]?.total ?? 0;
    return { users: usersRes.rows, total, page, limit };
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token." });
  }
});

fastify.get<{ Params: { id: string } }>("/api/admin/users/:id", async (request, reply) => {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Not authenticated." });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: number };
    const { rows: adminRows } = await pool.query(
      "SELECT is_admin FROM users WHERE id = $1",
      [payload.id],
    );
    if (adminRows.length === 0 || !adminRows[0].is_admin) {
      return reply.status(403).send({ error: "Access denied." });
    }
    const id = parseInt(request.params.id, 10);
    if (Number.isNaN(id)) {
      return reply.status(400).send({ error: "Invalid user id." });
    }
    const { rows } = await pool.query(
      `SELECT id, email, name, role, persona_id AS "personaId", is_admin AS "isAdmin", uuid
       FROM users WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) {
      return reply.status(404).send({ error: "User not found." });
    }
    return rows[0];
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token." });
  }
});

fastify.patch<{
  Params: { id: string };
  Body: { email?: string; password?: string; name?: string; role?: string; persona_id?: number | null };
}>("/api/admin/users/:id", async (request, reply) => {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Not authenticated." });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: number };
    const { rows: userRows } = await pool.query(
      "SELECT is_admin FROM users WHERE id = $1",
      [payload.id],
    );
    if (userRows.length === 0 || !userRows[0].is_admin) {
      return reply.status(403).send({ error: "Access denied." });
    }
    const id = parseInt(request.params.id, 10);
    if (Number.isNaN(id)) {
      return reply.status(400).send({ error: "Invalid user id." });
    }
    const { email, password, name, role, persona_id } = request.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (email !== undefined) {
      updates.push(`email = $${idx++}`);
      values.push((email as string).toLowerCase().trim());
    }
    if (password !== undefined && (password as string).trim() !== "") {
      const hashed = await bcrypt.hash((password as string).trim(), 10);
      updates.push(`password = $${idx++}`);
      values.push(hashed);
    }
    if (name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push((name as string).trim());
    }
    if (role !== undefined) {
      updates.push(`role = $${idx++}`);
      values.push((role as string).trim() || "User");
    }
    if (persona_id !== undefined) {
      updates.push(`persona_id = $${idx++}`);
      values.push(persona_id === null ? null : persona_id);
    }
    if (updates.length === 0) {
      return reply.status(400).send({ error: "No fields to update." });
    }
    values.push(id);
    await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${idx}`,
      values,
    );
    // Only set UUID when missing; never overwrite existing
    const { rows: uuidCheck } = await pool.query("SELECT uuid FROM users WHERE id = $1", [id] as unknown[]);
    if (uuidCheck.length > 0 && (uuidCheck[0].uuid == null || String(uuidCheck[0].uuid).trim() === "")) {
      const newUuid = randomUUID();
      await pool.query("UPDATE users SET uuid = $1 WHERE id = $2", [newUuid, id] as unknown[]);
    }
    return { ok: true };
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505"
      ? "A user with this email already exists."
      : "Failed to update user.";
    fastify.log.error(err);
    return reply.status(500).send({ error: msg });
  }
});

fastify.post<{
  Body: { email: string; password: string; name: string; role: string; persona_id?: number };
}>("/api/admin/users", async (request, reply) => {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Not authenticated." });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: number };
    const { rows: userRows } = await pool.query(
      "SELECT is_admin FROM users WHERE id = $1",
      [payload.id],
    );
    if (userRows.length === 0 || !userRows[0].is_admin) {
      return reply.status(403).send({ error: "Access denied." });
    }
    const { email, password, name, role, persona_id } = request.body;
    if (!email?.trim() || !password) {
      return reply.status(400).send({ error: "Email and password are required." });
    }
    const hashed = await bcrypt.hash(password, 10);
    const newUuid = randomUUID();
    await pool.query(
      `INSERT INTO users (email, password, name, role, persona_id, is_admin, uuid)
       VALUES ($1, $2, $3, COALESCE(NULLIF($4, ''), 'User'), $5, FALSE, $6)`,
      [email.toLowerCase().trim(), hashed, (name || email).trim(), role ?? "User", persona_id ?? null, newUuid],
    );
    return { ok: true };
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505"
      ? "A user with this email already exists."
      : "Failed to create user.";
    fastify.log.error(err);
    return reply.status(500).send({ error: msg });
  }
});

fastify.post<{
  Body: { confirm: boolean };
}>("/api/admin/factory-reset", async (request, reply) => {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Not authenticated." });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: number };
    const { rows: userRows } = await pool.query(
      "SELECT is_admin FROM users WHERE id = $1",
      [payload.id],
    );
    if (userRows.length === 0 || !userRows[0].is_admin) {
      return reply.status(403).send({ error: "Access denied." });
    }
    if (request.body?.confirm !== true) {
      return reply.status(400).send({ error: "Confirmation required. Send { confirm: true }." });
    }
    await factoryReset();
    return { ok: true };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: "Factory reset failed." });
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
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Not authenticated." });
  }
  let userId: number;
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: number };
    userId = payload.id;
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token." });
  }

  const slot = getTimeSlot();

  const [highlights, meetings, followUps, events, pending] = await Promise.all([
    pool.query(
      "SELECT label, text FROM highlights WHERE user_id = $1 AND time_slot = $2 LIMIT 1",
      [userId, slot],
    ),
    pool.query(
      "SELECT id, title, summary FROM meeting_summaries WHERE user_id = $1 AND time_slot = $2 ORDER BY id",
      [userId, slot],
    ),
    pool.query(
      "SELECT id, text, done FROM follow_ups WHERE user_id = $1 AND time_slot = $2 ORDER BY id",
      [userId, slot],
    ),
    pool.query(
      "SELECT id, time, title, tag, description, actions FROM schedule_events WHERE user_id = $1 AND time_slot = $2 ORDER BY id",
      [userId, slot],
    ),
    pool.query(
      "SELECT id, title, badge, description, actions FROM pending_items WHERE user_id = $1 AND time_slot = $2 ORDER BY id",
      [userId, slot],
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
