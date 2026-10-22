import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/nonce.js";
function fakeRes() {
  const headers = {};
  return {
    headers, statusCode: 200,
    setHeader(name, value) { headers[name]=value; },
    status(code) { this.statusCode=code; return this; },
    json(body) { this.body=body; return this; },
  };
}
test("nonce requires GET and rejects other methods", () => {
  const res=fakeRes();
  handler({method:"POST"},res);
  assert.equal(res.statusCode,405);
});
test("nonce is unique, 128 bits, HttpOnly and no-store", () => {
  const a=fakeRes(),b=fakeRes();
  handler({method:"GET"},a);
  handler({method:"GET"},b);
  assert.match(a.body.nonce,/^[a-f0-9]{32}$/);
  assert.notEqual(a.body.nonce,b.body.nonce);
  assert.match(a.headers["Set-Cookie"],/HttpOnly/);
  assert.match(a.headers["Set-Cookie"],/Max-Age=600/);
  assert.equal(a.headers["Cache-Control"],"no-store");
});
