import assert from "node:assert/strict";

const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

async function call(path, { method = "GET", cookie, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
    data: await response.json(),
  };
}

const first = await call("/api/session", { method: "POST" });
const second = await call("/api/session", { method: "POST" });
assert.equal(first.status, 201);
assert.equal(second.status, 201);

const created = await call("/api/matches", {
  method: "POST", cookie: first.cookie, body: { language: "es" },
});
assert.equal(created.status, 201, JSON.stringify(created.data));
const id = created.data.id;

const anonymousToken = await call(`/api/matches/${id}/token`, { method: "POST" });
assert.equal(anonymousToken.status, 401);

const room = await call(`/api/matches/${id}`, { cookie: first.cookie });
assert.equal(room.status, 200);
assert.equal(room.data.match.challenge_prompt, "El perro corre por el parque.");
const joined = await call("/api/invites/join", {
  method: "POST", cookie: second.cookie, body: { code: room.data.match.room_code },
});
assert.equal(joined.status, 200, JSON.stringify(joined.data));
assert.equal(joined.data.id, id);

const outsider = await call("/api/session", { method: "POST" });
const outsiderToken = await call(`/api/matches/${id}/token`, {
  method: "POST", cookie: outsider.cookie,
});
assert.equal(outsiderToken.status, 404);

const token = await call(`/api/matches/${id}/token`, {
  method: "POST", cookie: first.cookie,
});
assert.equal(token.status, 200, JSON.stringify(token.data));
const claims = JSON.parse(Buffer.from(token.data.token.split(".")[1], "base64url").toString());
assert.equal(claims.sub, first.data.user.id);
assert.equal(claims.video.room, room.data.match.livekit_room);

const started = await call(`/api/matches/${id}/start`, {
  method: "POST", cookie: first.cookie,
});
assert.equal(started.status, 200, JSON.stringify(started.data));
assert.equal(started.data.match.status, "playing");
console.log("Session, room, participant authorization, token, and start flow passed.");
