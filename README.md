# Example Multi-Container App

A multi-container application with a React + Vite frontend, Fastify backend API, and Nginx reverse proxy, orchestrated with Docker Compose.

## Architecture

- **Frontend** — React SPA built with Vite, served as static files via Nginx
- **Backend** — Fastify API server with `/api/health` and `/api/data` endpoints
- **Nginx** — Reverse proxy that serves the frontend and routes `/api/*` requests to the backend

## Quick Start (Docker Compose)

```bash
docker compose up --build
```

The app will be available at [http://localhost](http://localhost).

- Frontend: [http://localhost](http://localhost)
- API Health: [http://localhost/api/health](http://localhost/api/health)
- API Data: [http://localhost/api/data](http://localhost/api/data)

## Local Development

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on [http://localhost:5173](http://localhost:5173) with API requests proxied to the backend.

### Backend

```bash
cd backend
npm install
npm run dev
```

Runs on [http://localhost:4000](http://localhost:4000).

## Project Structure

```
├── frontend/          # React + Vite SPA
│   ├── src/           # React components and styles
│   ├── public/        # Static assets
│   ├── Dockerfile     # Multi-stage build (Node -> Nginx)
│   └── package.json
├── backend/           # Fastify API server
│   ├── src/           # Server source code
│   ├── Dockerfile     # Multi-stage build (Node)
│   └── package.json
├── nginx/
│   └── nginx.conf     # Reverse proxy configuration
└── docker-compose.yml # Container orchestration
```
