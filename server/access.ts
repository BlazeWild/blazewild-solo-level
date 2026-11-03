import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
const cookieName = "level_up_session";
const digest = (v: string) => createHash("sha256").update(v).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));
export function accessConfig(env: NodeJS.ProcessEnv) {
  const hosted = env.RENDER === "true" || env.HOST === "0.0.0.0", username = env.AUTH_USERNAME || env.AUTH_EMAIL || "", password = env.AUTH_PASSWORD || "", sessionSecret = env.SESSION_SECRET || "";
  const originValue = env.APP_URL || env.RENDER_EXTERNAL_URL;
  if (hosted && !username) throw Error("Hosted mode is missing AUTH_USERNAME or AUTH_EMAIL");
  if (hosted && password.length < 20) throw Error("Hosted mode is missing AUTH_PASSWORD or it is shorter than 20 characters");
  if (hosted && sessionSecret.length < 32) throw Error("Hosted mode is missing SESSION_SECRET or it is shorter than 32 characters");
  if (hosted && (!originValue || new URL(originValue).protocol !== "https:")) throw Error("Hosted mode requires an HTTPS APP_URL or RENDER_EXTERNAL_URL");
  return { hosted, username, password, sessionSecret: sessionSecret || randomBytes(32).toString("hex"), origin: originValue ? new URL(originValue).origin : "", host: hosted ? "0.0.0.0" : "127.0.0.1" };
}
const cookies = (header = "") => Object.fromEntries(header.split(";").map(v => v.trim().split(/=(.*)/s).slice(0, 2)).filter(v => v[0]));
const makeToken = (c: ReturnType<typeof accessConfig>, expires: number) => { const body = Buffer.from(JSON.stringify({ sub: c.username, expires })).toString("base64url"); return `${body}.${createHmac("sha256", c.sessionSecret).update(body).digest("base64url")}`; };
export function isAuthenticated(c: ReturnType<typeof accessConfig>, req: { headers: { cookie?: string } }) {
  if (!c.hosted) return true;
  const [body, sig] = (cookies(req.headers.cookie)[cookieName] || "").split(".");
  if (!body || !sig || !same(sig, createHmac("sha256", c.sessionSecret).update(body).digest("base64url"))) return false;
  try { const data = JSON.parse(Buffer.from(body, "base64url").toString()); return data.sub === c.username && data.expires > Date.now(); } catch { return false; }
}
export function authHandlers(c: ReturnType<typeof accessConfig>) {
  const attempts = new Map<string, { count: number; reset: number }>();
  const login: RequestHandler = (req, res) => { const key = req.ip || "unknown", prior = attempts.get(key), current = !prior || prior.reset < Date.now() ? { count: 0, reset: Date.now() + 15 * 60000 } : prior; if (current.count >= 5) return res.status(429).json({ error: "Too many attempts; try again in 15 minutes" }); const username = String(req.body?.username || ""), password = String(req.body?.password || ""); if (!same(username, c.username) || !same(password, c.password)) { current.count++; attempts.set(key, current); return res.status(401).json({ error: "Invalid owner credentials" }); } attempts.delete(key); const age = 30 * 86400; res.setHeader("Set-Cookie", `${cookieName}=${makeToken(c, Date.now() + age * 1000)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${c.hosted ? "; Secure" : ""}`); res.json({ ok: true }); };
  const logout: RequestHandler = (_req, res) => { res.setHeader("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${c.hosted ? "; Secure" : ""}`); res.json({ ok: true }); };
  return { login, logout };
}
export function accessGuard(c: ReturnType<typeof accessConfig>): RequestHandler { return (req, res, next) => {
  res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("X-Frame-Options", "DENY"); res.setHeader("Referrer-Policy", "same-origin");
  if (!isAuthenticated(c, req)) return res.status(401).json({ error: "Owner login required" });
  const origin = req.get("origin"); if (origin) { let valid = false; try { const u = new URL(origin); valid = c.hosted ? u.origin === c.origin : ["localhost", "127.0.0.1"].includes(u.hostname) && ["3001", "5173", "4173"].includes(u.port); } catch {} if (!valid) return res.status(403).json({ error: "Cross-origin request denied" }); }
  if (!["GET", "HEAD"].includes(req.method) && req.get("x-level-up") !== "local") return res.status(403).json({ error: "Missing local request header" }); next();
}; }
