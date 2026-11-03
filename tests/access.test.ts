import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { accessConfig, accessGuard, authHandlers } from "../server/access.js";

const env = {
  HOST: "0.0.0.0", AUTH_USERNAME: "owner", AUTH_PASSWORD: "a-test-password-long-enough",
  RENDER_EXTERNAL_URL: "https://example.onrender.com",
  SESSION_SECRET: "a-test-session-secret-at-least-32-characters",
};
test("hosted startup fails closed and local defaults remain local", () => {
  assert.throws(() => accessConfig({ RENDER: "true" }), /AUTH_USERNAME/);
  assert.throws(() => accessConfig({ ...env, RENDER_EXTERNAL_URL: "http://example.com" }), /HTTPS/);
  assert.equal(accessConfig({}).host, "127.0.0.1");
  assert.equal(accessConfig(env).host, "0.0.0.0");
});
test("hosted pages and API require credentials and writes require same origin and header", async () => {
  const app = express();
  app.use(express.json());
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  const config = accessConfig(env), auth = authHandlers(config);
  app.post("/api/auth/login", auth.login);
  app.use(accessGuard(config));
  app.use((_req, res) => res.json({ private: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(base + "/api/health")).status, 200);
    for (const path of ["/", "/api/state", "/api/backup", "/sw.js"]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 401);
    }
    const bad = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "wrong", password: "wrong" }) }); assert.equal(bad.status, 401);
    const login = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: env.AUTH_USERNAME, password: env.AUTH_PASSWORD }) }); assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.equal((await fetch(base, { headers: { cookie } })).status, 200);
    assert.equal((await fetch(base, { method: "POST", headers: { cookie } })).status, 403);
    assert.equal((await fetch(base, { method: "POST", headers: { cookie, "x-level-up": "local", origin: "https://evil.example" } })).status, 403);
    assert.equal((await fetch(base, { method: "POST", headers: { cookie, "x-level-up": "local", origin: env.RENDER_EXTERNAL_URL } })).status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
