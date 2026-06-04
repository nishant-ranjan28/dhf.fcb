// Client-only player identity for the (no-login) predictions game. Mirrors the
// poll's device-id approach: a stable random id in localStorage plus a chosen
// nickname. All functions touch localStorage, so only call them in the browser
// (event handlers / effects), never during render/SSR.

const DEVICE_KEY = "bp:deviceId";
const NAME_KEY = "bp:playerName";

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `d-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getPlayerName(): string {
  return localStorage.getItem(NAME_KEY) ?? "";
}

export function setPlayerName(name: string): void {
  localStorage.setItem(NAME_KEY, name.trim().slice(0, 24));
}
