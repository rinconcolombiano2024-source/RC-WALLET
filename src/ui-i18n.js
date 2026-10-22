// The existing Spanish interface is retained as the default to avoid
// changing financial transaction copy unexpectedly. Incremental translations
// cover core navigation first; never translate signed blockchain payloads.
export const UI_LOCALES = Object.freeze(["es", "en", "pl"]);

export function normalizeUiLocale(value) {
  const key = typeof value === "string" ? value.slice(0, 2).toLowerCase() : "";
  return UI_LOCALES.includes(key) ? key : "es";
}

const strings = Object.freeze({
  es: Object.freeze({
    "nav.home": "Inicio",
    "nav.tokens": "Tokens",
    "nav.recovery": "Mover",
    "nav.markets": "Mercados",
    "nav.tools": "Herramientas",
    "hero.description": "Detecta activos EVM y habilita movimientos únicamente cuando existe una firma válida para la red correspondiente.",
    "footer.safety": "RC Wallet · Sin custodia · Nunca compartas tu frase semilla",
    "history.check": "Verificar operaciones pendientes en World Chain",
    "history.checking": "Verificando operaciones pendientes…",
    "history.failed": "Fallida",
    "history.pending": "Pendiente",
    "history.confirmed": "Confirmada",
    "button.back": "Atrás",
    "button.close": "Cerrar",
  }),
  en: Object.freeze({
    "nav.home": "Home",
    "nav.tokens": "Tokens",
    "nav.recovery": "Move",
    "nav.markets": "Markets",
    "nav.tools": "Tools",
    "hero.description": "View EVM assets and move funds only with valid signing authority on the corresponding network.",
    "footer.safety": "RC Wallet · Non-custodial · Never share your seed phrase",
    "history.check": "Verify pending World Chain transactions",
    "history.checking": "Checking pending transactions…",
    "history.failed": "Failed",
    "history.pending": "Pending",
    "history.confirmed": "Confirmed",
    "button.back": "Back",
    "button.close": "Close",
  }),
  pl: Object.freeze({
    "nav.home": "Start",
    "nav.tokens": "Tokeny",
    "nav.recovery": "Przelewy",
    "nav.markets": "Rynki",
    "nav.tools": "Narzędzia",
    "hero.description": "Sprawdzaj aktywa EVM i przelewaj środki tylko z ważnym uprawnieniem do podpisu w odpowiedniej sieci.",
    "footer.safety": "RC Wallet · Portfel niepowierniczy · Nigdy nie udostępniaj frazy odzyskiwania",
    "history.check": "Sprawdź oczekujące transakcje World Chain",
    "history.checking": "Sprawdzanie oczekujących transakcji…",
    "history.failed": "Nieudana",
    "history.pending": "Oczekująca",
    "history.confirmed": "Potwierdzona",
    "button.back": "Wstecz",
    "button.close": "Zamknij",
  }),
});

export function uiText(locale, key) {
  return strings[normalizeUiLocale(locale)][key] ?? strings.es[key] ?? key;
}
