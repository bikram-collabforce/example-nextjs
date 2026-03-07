# Digital Twin — Conversation & Plan Log

Summary of decisions and changes from our sessions. Use this for context and continuity.

---

## Backend & Data

- **No drop/reseed on restart**  
  `initDb()` no longer drops tables on startup. Data persists across backend restarts.

- **Factory reset (admin only)**  
  Exported `factoryReset()` in `backend/src/db.ts` drops all tables and re-runs init + seed.  
  Triggered from UI: Administration → User and data management → “Factory reset” with confirmation modal.

- **User creation (admin only)**  
  POST `/api/admin/users` (email, password, name, role, persona_id).  
  GET `/api/admin/personas` for the create-user persona dropdown.

- **Domain**  
  All `collabforce.com` references renamed to `collabforce.org` (frontend: App.tsx, Login.tsx; backend: db.ts).

---

## Navigation & Layout

- **Left nav (sidebar)**  
  - Order: Logo → Main (Dashboard, Notes, Files, Settings) → Admin (Statistics, Administration, if admin) → divider → Chat (Chats + indented chat history) → divider → footer.  
  - Calendar removed.  
  - Settings lives in left nav (not in top bar).

- **Top bar**  
  - Left: hamburger (mobile only), then breadcrumb + page title.  
  - Right: user menu (avatar, name, role, logout icon).  
  - No Settings in top bar.

- **Sidebar footer**  
  “Digital Twin v0.1 / Your AI work assistant” pinned to bottom via `margin-top: auto` and `flex-shrink: 0` on `.sidebarFooter`.

- **Chat history (left nav)**  
  - Section at bottom of sidebar with “Chats” and indented list (e.g. Current chat, Budget & Q4 review, …).  
  - Scrollbar only in chat history: `.chatHistoryNav` has `max-height: 312px` and `overflow-y: auto`; `.sidebar` has `overflow: hidden`.  
  - Height increased by 30% from original (then +1px on call button radius per request).

- **Mobile (≤960px)**  
  - Hamburger toggles sidebar; sidebar slides in from left with overlay backdrop.  
  - Tapping nav item (Dashboard, Statistics, Administration) or backdrop closes menu.  
  - `navTo(view)` used for closing menu after navigation.

---

## Administration Tabs

- **Integrations**  
  First tab: integration groups, Add/Edit OAuth, Enable/Disable. Edit disabled when integration is enabled.

- **User and data management**  
  Second tab: Create user (email, password, name, role, persona) and “Factory reset (drop & reseed)” with confirmation modal. Factory reset requires `{ confirm: true }` and logs user out after success.

---

## Chat Bar (Dashboard)

- **Sign out**  
  Replaced “Sign Out” text with logout icon (door + arrow) in top bar; `title` and `aria-label` “Sign out”.

- **Call icon**  
  Phone icon button to the right of the Send button.  
  - Light purple border: `1px solid rgba(102, 78, 200, 0.28)`.  
  - Border radius: left corners `var(--border-radius-sm)`, top-right and bottom-right `17px`.

- **Voice**  
  Voice icon was added then rolled back; not present in current UI.

- **Input width**  
  Call icon was briefly overlaid on input; then moved to right of Send so search bar width is unchanged (input in `chatInputWrap` with `flex: 1`).

---

## File Reference

| Area              | Files |
|-------------------|--------|
| App shell, nav, chat bar | `frontend/src/App.tsx` |
| Styles            | `frontend/src/App.module.css` |
| Login, demo emails | `frontend/src/Login.tsx` |
| DB, schema, seed, factoryReset | `backend/src/db.ts` |
| API, auth, admin routes | `backend/src/server.ts` |

---

*Last updated from conversation log.*
