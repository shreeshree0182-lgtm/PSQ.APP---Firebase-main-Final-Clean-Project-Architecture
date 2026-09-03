const PIN_KEY = "SUPERVISOR_PIN";
const DEFAULT_PIN = "1234";

export function getSupervisorPin() {
  try {
    const stored = localStorage.getItem(PIN_KEY);
    if (stored && /^\d{4}$/.test(stored)) return stored;
  } catch {}
  return DEFAULT_PIN;
}

export function setSupervisorPin(newPin) {
  try {
    localStorage.setItem(PIN_KEY, newPin);
  } catch {}
}

export function verifySupervisorPin(pin) {
  return pin === getSupervisorPin();
}
