import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import { organicRead } from './providers/organicsmm.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const mock = (process.env.PROVIDER_MODE || 'mock') !== 'live';
const providerKey = process.env.ORGANIC_SMM_API_KEY;
if (!mock && (!providerKey || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) throw new Error('Live mode requires the selected provider API key and a 32+ character JWT_SECRET');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) throw new Error('Set JWT_SECRET to a random string of at least 24 characters');

const pool = mysql.createPool({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), database: process.env.MYSQL_DATABASE, user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, waitForConnections: true, connectionLimit: 10, charset: 'utf8mb4' });
app.use(helmet());
app.use(cors({ origin: process.env.APP_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '32kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));

class AppError extends Error { constructor(status, message) { super(message); this.status = status; } }
const mockServices = [
  { service: 'demo-101', name: 'Creator profile audit', rate: '8.00', min: '1', max: '1', category: 'Education', type: 'Demo only', refill: false },
  { service: 'demo-102', name: 'Content strategy session', rate: '25.00', min: '1', max: '1', category: 'Education', type: 'Demo only', refill: false },
  { service: 'demo-103', name: 'Campaign analytics review', rate: '12.00', min: '1', max: '1', category: 'Education', type: 'Demo only', refill: false }
];
const restricted = /followers?|likes?|views?|subscribers?|comments?|shares?|votes?|engagement|impressions|plays?|streams?|saves?|bot|fake/i;
async function provider(action, fields = {}) {
  if (mock) return mockProvider(action, fields);
  return organicRead(action, fields);
}
function mockProvider(action, fields) {
  if (action === 'services') return mockServices;
  if (action === 'balance') return { balance: '0.00', currency: 'USD' };
  if (action === 'add') return { order: `DEMO-${Date.now()}` };
  if (action === 'status') return { status: 'Demo only', remains: '0', charge: '0.00' };
  return { status: 'Demo only' };
}
function visibleServices(rows) { return rows.filter(s => !restricted.test(`${s.name || ''} ${s.category || ''}`)); }
function catalogServices(rows) {
  // OrganicSMM catalog is shown in read-only mode so an admin can inspect the provider's full list.
  // Ordering still uses visibleServices and OrganicSMM's add action remains disabled.
  if (!mock) return rows;
  return visibleServices(rows);
}
function auth(req, res, next) {
  try { const token = req.headers.authorization?.replace(/^Bearer\s+/i, ''); if (!token) throw new Error(); req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { next(new AppError(401, 'Sign in to continue')); }
}
function admin(req, res, next) { if (req.user?.role !== 'admin') return next(new AppError(403, 'Administrator access required')); next(); }
async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL; const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const [rows] = await pool.execute('SELECT id FROM users WHERE email=?', [email.toLowerCase()]);
  if (!rows.length) await pool.execute('INSERT INTO users(email,password_hash,role) VALUES(?,?,?)', [email.toLowerCase(), await bcrypt.hash(password, 12), 'admin']);
}
let adminSeedPromise;
async function ensureAdminOnce() {
  if (!adminSeedPromise) adminSeedPromise = ensureAdmin().catch(error => { adminSeedPromise = undefined; throw error; });
  return adminSeedPromise;
}
if (process.env.VERCEL === '1') {
  app.use('/api/auth/login', (req,res,next) => { ensureAdminOnce().then(() => next()).catch(next); });
}
app.get('/api/health', (req,res) => res.json({ ok: true, provider: 'organicsmm', providerMode: mock ? 'mock' : 'live' }));
app.post('/api/auth/login', async (req,res,next) => {
  try { const { email, password } = z.object({ email: z.string().email().max(190), password: z.string().min(1).max(200) }).parse(req.body); const [rows] = await pool.execute('SELECT id,email,password_hash,role FROM users WHERE email=?', [email.toLowerCase()]); const user = rows[0]; if (!user || !await bcrypt.compare(password, user.password_hash)) throw new AppError(401, 'Email or password is incorrect'); const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '12h' }); res.json({ token, user: { id: user.id, email: user.email, role: user.role } }); }
  catch(e) { next(e); }
});
app.get('/api/auth/me', auth, (req,res) => res.json({ user: req.user }));
app.get('/api/services', auth, async (req,res,next) => { try { const rows = await provider('services'); res.json({ services: catalogServices(rows), provider: 'organicsmm', mode: mock ? 'mock' : 'live', readOnly: !mock }); } catch(e) { next(e); } });
app.get('/api/balance', auth, async (req,res,next) => { try { res.json(await provider('balance')); } catch(e) { next(e); } });
app.get('/api/orders', auth, async (req,res,next) => { try { const [rows] = await pool.execute('SELECT id,provider_order_id,service_id,service_name,target_url,quantity,status,remains,charge,is_demo,created_at FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 100', [req.user.id]); res.json({ orders: rows }); } catch(e) { next(e); } });
app.post('/api/orders', auth, async (req,res,next) => {
  try {
    if (!mock) throw new AppError(403, 'OrganicSMM order placement is disabled in this project.');
    const input = z.object({ service: z.string().min(1).max(80), link: z.string().url().max(2048), quantity: z.coerce.number().int().min(1).max(1000000) }).parse(req.body);
    const services = visibleServices(await provider('services')); const service = services.find(s => String(s.service) === input.service);
    if (!service) throw new AppError(400, 'Choose an available service');
    const min = Number(service.min || 1), max = Number(service.max || 1);
    if (input.quantity < min || input.quantity > max) throw new AppError(400, `Quantity must be between ${min} and ${max}`);
    const placed = await provider('add', { service: input.service, link: input.link, quantity: input.quantity });
    if (placed?.error || !placed?.order) throw new AppError(502, placed?.error || 'Provider did not confirm an order');
    const [result] = await pool.execute('INSERT INTO orders(user_id,provider_order_id,service_id,service_name,target_url,quantity,status,is_demo) VALUES(?,?,?,?,?,?,?,?)', [req.user.id, String(placed.order), input.service, service.name, input.link, input.quantity, mock ? 'Demo only' : 'Pending', mock]);
    res.status(201).json({ id: result.insertId, providerOrderId: String(placed.order), status: mock ? 'Demo only' : 'Pending', demo: mock, message: mock ? 'Simulation only. No provider order was placed.' : 'Order submitted.' });
  } catch(e) { next(e); }
});
app.get('/api/orders/:id/status', auth, async (req,res,next) => { try { const [rows] = await pool.execute('SELECT * FROM orders WHERE id=? AND user_id=?', [req.params.id, req.user.id]); const order = rows[0]; if (!order) throw new AppError(404,'Order not found'); if (order.is_demo) return res.json({ status: 'Demo only', remains: 0 }); const data = await provider('status', { order: order.provider_order_id }); await pool.execute('UPDATE orders SET status=?,remains=?,charge=? WHERE id=?', [data.status || 'Unknown', data.remains ?? null, data.charge ?? null, order.id]); res.json(data); } catch(e) { next(e); } });
app.get('/api/admin/config', auth, admin, (req,res) => res.json({ provider: 'organicsmm', providerMode: mock ? 'mock' : 'live', providerKeyConfigured: Boolean(providerKey), policy: 'OrganicSMM catalog and balance are available in live mode. Order placement and order-status lookup are disabled.' }));
app.put('/api/admin/config', auth, admin, (req,res) => res.status(409).json({ error: 'OrganicSMM credentials are configured through server environment variables; restart after updating them.' }));
app.use((err,req,res,next) => { const status = err instanceof z.ZodError ? 400 : (err.status || 500); const message = err instanceof z.ZodError ? 'Check the submitted fields' : status >= 500 && !err.status ? 'Unexpected server error' : err.message; if (status >= 500) console.error(err.message); res.status(status).json({ error: message }); });
if (process.env.NODE_ENV === 'production' && process.env.VERCEL !== '1') {
  const frontendDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
  app.use(express.static(frontendDist));
  app.get('*', (req,res,next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(frontendDist, 'index.html')));
}
if (process.env.VERCEL !== '1') {
  app.listen(port, async () => { try { await ensureAdmin(); console.log(`VOX API listening on ${port} (${mock ? 'mock' : 'live'} provider mode)`); } catch(e) { console.error('Database startup failed:', e.message); process.exit(1); } });
}

export default app;
