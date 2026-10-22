import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUiLocale, UI_LOCALES, uiText } from "../src/ui-i18n.js";

test("Spanish remains the safe default and prior language settings are preserved", () => {
  assert.equal(normalizeUiLocale(null), "es");
  assert.equal(normalizeUiLocale("unknown"), "es");
  assert.equal(normalizeUiLocale("es-CO"), "es");
  assert.equal(normalizeUiLocale("en-US"), "en");
  assert.equal(normalizeUiLocale("pl-PL"), "pl");
});

test("navigation and core safety notices exist in all three languages", () => {
  const keys = [
    "nav.home", "nav.tokens", "nav.recovery", "nav.markets",
    "nav.tools", "hero.description", "footer.safety",
    "history.check", "history.checking", "history.failed",
    "history.pending", "history.confirmed", "button.back", "button.close",
  ];
  assert.deepEqual(UI_LOCALES, ["es", "en", "pl"]);
  for (const locale of UI_LOCALES) {
    for (const key of keys) {
      const value = uiText(locale, key);
      assert.ok(typeof value === "string" && value.length > 0, `${locale} missing ${key}`);
      assert.notEqual(value, key);
    }
  }
});

test("unknown dictionary keys never alter signed transaction values", () => {
  const blockchainHash = "0x" + "f".repeat(64);
  assert.equal(uiText("pl", blockchainHash), blockchainHash);
  assert.equal(uiText("en", "missing"), "missing");
});
