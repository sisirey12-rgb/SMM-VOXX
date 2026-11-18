# VOX SMM Panel

A new purple branded creator services workspace with a React/Vite frontend, Node.js/Express API, and MySQL storage. The Ezkify adapter follows the provider's documented API v2 format. **The default provider mode is a safe demo.** Demo orders are simulations and do not contact Ezkify.

## Provider API verified

Repository: [ezkify/smm-panel-api](https://github.com/ezkify/smm-panel-api)  
Reference: [API v2 reference](https://github.com/ezkify/smm-panel-api/blob/main/docs/api-reference.md)

- Base URL: `https://ezkify.com/api/v2`
- Method and body: `POST`, `application/x-www-form-urlencoded`
- Authentication: `key=YOUR_API_KEY` in the form body
- Actions implemented: `services`, `balance`, `add`, and single-order `status`
- Documented service fields used: `service`, `name`, `rate`, `min`, `max`, `category`, `refill`
- Documented order fields used: `service`, `link`, `quantity`; response `order`
- Documented status response fields used: `status`, `remains`, `charge`
- Provider errors with an `error` field are returned as a safe API error.

The upstream reference also documents refill, refill status, and cancel. They are intentionally not exposed in this starter API. The provider's example catalog contains engagement services. VOX filters service names/categories associated with follower, like, view, comment, vote, and similar metric manipulation, and blocks these from live ordering. Live ordering additionally requires an explicit service ID allowlist. Review provider terms and the authorization for every service before enabling any live service.

This starter submits the documented standard quantity order fields only. The API reference also describes custom-comment, package, drip-feed/subscription, and poll-vote order forms; those service-specific forms are not implemented here.

## OrganicSMM read-only connection

The API access page documents `POST https://organicsmm.online/functions/v1/public-api` with a JSON body containing `key` and `action`. VOX can call the `services` and `balance` actions in live mode. The complete returned catalog is shown in a clearly marked read-only view so an administrator can inspect provider offerings. The `add` and `status` actions are disabled: this provider advertises automated engagement designed to appear organic, which is outside the project's permitted use. No OrganicSMM listing can be ordered through VOX. Do not configure an OrganicSMM key in a browser or frontend environment variable.

To use its read-only endpoints, set `PROVIDER_NAME=organicsmm`, `PROVIDER_MODE=live`, and `ORGANIC_SMM_API_KEY` in the backend's private environment. No key is included in this archive.

## Project structure

```text
VOX-SMM/
├── backend/src/server.js       # REST API, auth, provider adapter
├── frontend/src/               # React responsive application
├── database/schema.sql         # MySQL schema/migration
├── .env.example                # Configuration template, no secrets
└── README.md
```

## Local setup

Requirements: Node.js 20+, MySQL 8+.

1. Create the MySQL schema with `mysql -u root -p < database/schema.sql`.
2. Copy `.env.example` to `.env` and set the MySQL connection, a random JWT secret, and a strong administrator password. The administrator is created on first server start.
3. Install and start:

   ```sh
   npm install
   npm --prefix backend install
   npm --prefix frontend install
   npm run dev
   ```

4. Open `http://localhost:5173`. Sign in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` values you set in `.env`.

## Provider configuration

Keep `PROVIDER_MODE=mock` until deployment is ready. In mock mode the app shows a small demonstration catalog; orders are stored locally with `is_demo=true`, carry a `Demo only` status, and never contact the provider.

To enable live mode, configure these only in the backend deployment's private environment settings:

```dotenv
PROVIDER_MODE=live
EZKIFY_API_KEY=your-provider-key
EZKIFY_ALLOWED_SERVICE_IDS=reviewed-id-1,reviewed-id-2
```

The allowlist must contain only services you have personally reviewed as authorized and compliant. The server also filters known engagement manipulation terms. Never put the provider key in frontend variables, browser code, a committed `.env`, or chat. Keep `.env` private; `.gitignore` excludes it.

## Production deployment

1. Provision a Node.js 20+ host and managed MySQL database. Restrict database network access to the app host.
2. Run the schema once against the production database.
3. Set all `.env.example` values in the host's encrypted environment configuration. Use `NODE_ENV=production`, `APP_ORIGIN` set to the public site origin, a unique long `JWT_SECRET`, and a strong `ADMIN_PASSWORD`. Start with `PROVIDER_MODE=mock`.
4. Build the frontend using `npm install`, `npm --prefix backend install`, `npm --prefix frontend install`, then `npm run build`. Start with `npm start`; production mode serves `frontend/dist` from the Express app.
5. Sign in as the administrator, confirm the demo experience, and review provider authorization and terms before any service IDs are allowlisted and live mode is enabled.
6. Use HTTPS, rotate credentials if exposed, back up MySQL, and configure your host's normal process health monitoring at `/api/health`.

## REST API

- `POST /api/auth/login` — email/password; returns a 12-hour bearer token.
- `GET /api/auth/me` — current account.
- `GET /api/services` — filtered catalog and `mock`/`live` mode.
- `GET /api/balance` — provider balance (zero in mock mode).
- `GET /api/orders` — current user's latest 100 orders.
- `POST /api/orders` — validated service, URL, quantity; live requests must match the allowlist.
- `GET /api/orders/:id/status` — status for a current user's order.
- `GET /api/admin/config` — administrator view of provider mode, key presence, allowlist and policy.

When `PROVIDER_NAME=organicsmm`, `/api/services` and `/api/balance` use OrganicSMM. `/api/orders` cannot place OrganicSMM orders, and OrganicSMM order-status lookups are not supported.

Authentication uses bcrypt-hashed passwords and signed JWTs. The API includes Helmet headers, exact-origin CORS, bounded JSON bodies, login rate limiting, input validation, ownership checks for orders, and generic unexpected error responses. Public self-registration and customer payment collection are not included.
