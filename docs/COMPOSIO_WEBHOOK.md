# Composio webhook – local development

To receive Gmail trigger events (e.g. new email) from Composio on your machine, your backend must be reachable at a **public URL**. Composio will send `POST /api/webhooks/composio` to that URL.

## 1. Expose your local backend

From the project root:

```bash
# Terminal 1: start the backend
cd backend && npm run dev

# Terminal 2: expose it with ngrok
./expose-backend.sh
```

Or with npx directly:

```bash
npx ngrok http 4000
```

Ngrok will print a public HTTPS URL (e.g. `https://abc123.ngrok-free.app`).

## 2. Set the webhook URL in Composio

1. Open [Composio Platform](https://platform.composio.dev) → **Settings** → **Webhook** (or **Webhook URL**).
2. Set **Webhook URL** to:
   ```text
   https://YOUR_NGROK_URL/api/webhooks/composio
   ```
   Example: `https://abc123.ngrok-free.app/api/webhooks/composio`
3. Ensure the webhook is subscribed to **Trigger events** (e.g. `composio.trigger.message`).
4. Save. If Composio shows a **webhook secret**, copy it and paste it into the app’s Gmail integration (Administration → Integrations → Gmail → Edit → Webhook secret).

## 3. See webhook payloads in the console

When a new Gmail message triggers an event, Composio sends a POST to your backend. The backend:

- Logs the **full payload** with `console.log("[Composio Webhook] Full payload:", ...)`.
- For `GMAIL_NEW_GMAIL_MESSAGE`, also logs a short line: `[Composio Webhook] [Gmail] New email | From: ... | Subject: ... | Snippet: ...`

Watch your **backend terminal** (where `npm run dev` is running) to see these logs.

## 4. Optional: use the public URL for connect/callback

If you want the full Gmail Connect flow to work while using ngrok:

1. Set env when starting the backend:
   ```bash
   BACKEND_URL=https://YOUR_NGROK_URL FRONTEND_URL=http://localhost:5173 npm run dev
   ```
2. The Gmail “Connect” link and callback will then use the ngrok URL so Composio can redirect back to your backend.
