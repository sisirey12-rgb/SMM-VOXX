# VOX SMM Panel

VOX is a purple creator-services workspace with a React/Vite frontend, a Node.js/Express API, and MySQL storage. OrganicSMM is the only integrated provider. Live access is read-only: VOX loads the provider catalog and balance. Live order placement and order-status lookup are disabled. The default mode is a safe demo; demo orders are local simulations and never contact OrganicSMM.

## OrganicSMM API integration

The adapter uses the documented endpoint `POST https://organicsmm.online/functions/v1/public-api` and sends JSON with the server-side `key` and `action` fields. It supports `services` and `balance`, validates and normalizes their documented response shapes, and never exposes the API key to the browser. The full provider catalog is available in the VOX interface as a clearly marked read-only list.

Set `PROVIDER_MODE=live` and `ORGANIC_SMM_API_KEY` in the backend environment to connect your account. Do not paste the API key into source files, frontend variables, or chat. Without the key, keep `PROVIDER_MODE=mock` to use the demo experience.

## Project structure

```text
VOX-SMM/
├── backend/src/server.js              # Express API, authentication, OrganicSMM adapter
├── backend/src/providers/organicsmm.js # OrganicSMM read-only integration
├── frontend/src/                       # Responsive React application
├── database/schema.sql                 # MySQL schema
├── vercel.json                         # Frontend/backend Vercel services and routing
├── .env.example                        # Configuration template, no secrets
└── README.md
```

## Local setup

Requirements: Node.js 20+ and MySQL 8+.

1. Create the database schema with `mysql -u root -p < database/schema.sql`.
2. Copy `.env.example` to `.env`. Set a random JWT secret, a strong admin password, and your MySQL connection values. The administrator is created on first server start.
3. Install and start:

   ```sh
   npm install
   npm --prefix backend install
   npm --prefix frontend install
   npm run dev
   ```

4. Open `http://localhost:5173` and sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`.

## Vercel multi-service deployment

The root `vercel.json` defines two services: `backend` (Express, rooted at `backend/`) and `frontend` (Vite, rooted at `frontend/`). Requests to `/api` and `/api/*` route to the backend; all other paths route to the frontend. The frontend calls the API through same-origin `/api/...` browser requests, so no service binding is used. MySQL and OrganicSMM are external services.

Vercel runs Express as a function. The API exports the Express app and does not call `listen()` or serve `frontend/dist` when `VERCEL=1`. The local Node host keeps its normal listener and optional static frontend serving. The admin account is initialized once per warm function instance when the login route is first called.

1. Import the GitHub repository as a Vercel project with the repository root as the project root.
2. Provision a MySQL database reachable from Vercel and run `database/schema.sql` once.
3. Add these environment variables in Vercel Project Settings for the backend runtime: `JWT_SECRET` (at least 32 random characters), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, and `MYSQL_PASSWORD`. Start with `PROVIDER_MODE=mock`.
4. Deploy. To connect OrganicSMM, set `PROVIDER_MODE=live` and configure `ORGANIC_SMM_API_KEY` in Vercel's private environment settings. Never add provider secrets to `VITE_*` variables.

## Node.js host deployment

1. Provision a Node.js 20+ host and managed MySQL database. Ensure the database accepts connections from the app host.
2. Run `database/schema.sql` once against the database.
3. Set the values from `.env.example` in the host's private environment. Use `NODE_ENV=production`, a unique long `JWT_SECRET`, and a strong `ADMIN_PASSWORD`.
4. Install dependencies, build the frontend with `npm run build`, then start the API with `npm start`.
5. Use HTTPS, back up MySQL, and configure health monitoring for `/api/health`.

## API routes

- `POST /api/auth/login` — sign in and receive a 12-hour bearer token.
- `GET /api/auth/me` — current account.
- `GET /api/services` — OrganicSMM service catalog (full list in live mode, demo list in mock mode).
- `GET /api/balance` — OrganicSMM balance (demo value in mock mode).
- `GET /api/orders` — current user's latest 100 saved orders.
- `POST /api/orders` — demo-only simulations in mock mode; returns a forbidden response in live mode.
- `GET /api/orders/:id/status` — demo status only; live OrganicSMM status lookups are disabled.
- `GET /api/admin/config` — administrator view of provider mode and whether the server key is configured.

Authentication uses bcrypt-hashed passwords and signed JWTs. The API includes Helmet headers, bounded JSON bodies, login rate limiting, input validation, order ownership checks, and safe error responses. Public self-registration and customer payment collection are not included.
