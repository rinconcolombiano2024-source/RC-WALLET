import assert from "node:assert/strict";
import test from "node:test";
import handler from "../api/nonce.js";

function response() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    setHeader(name, value) { headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("nonce endpoint rejects non-GET methods", () => {
  const res = response();
  handler({ method: "POST" }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "GET");
});

test("nonce is random, expires and is never cached", () => {
  const first = response();
  const second = response();
  handler({ method: "GET" }, first);
  handler({ method: "GET" }, second);
  assert.equal(first.statusCode, 200);
  assert.match(first.body.nonce, /^[a-f0-9]{32}$/);
  assert.notEqual(first.body.nonce, second.body.nonce);
  assert.match(first.headers["Set-Cookie"], /HttpOnly/);
  assert.match(first.headers["Set-Cookie"], /SameSite=Lax/);
  assert.match(first.headers["Set-Cookie"], /Max-Age=600/);
  assert.equal(first.headers["Cache-Control"], "no-store");
});
