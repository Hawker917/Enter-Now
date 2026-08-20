/* Enter Now Web Push bridge.
   The static app can stay on GitHub Pages while the push scheduler lives on Cloudflare.
   Set localStorage.enterNowPushApi to the deployed Worker URL during testing,
   or define window.ENTER_NOW_PUSH_API before this script loads.
*/
(() => {
  "use strict";

  const apiBase = () => (window.ENTER_NOW_PUSH_API || localStorage.getItem("enterNowPushApi") || "").replace(/\/$/, "");
  const $ = (id) => document.getElementById(id);

  function base64urlToUint8Array(value) {
    const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function api(path, options = {}) {
    const base = apiBase();
    if (!base) throw new Error("Push service URL is not configured yet.");
    const response = await fetch(base + path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Push service returned ${response.status}`);
    return data;
  }

  async function enable() {
    const status = $("lockStatus");
    const button = $("enableNotifications");
    if (!apiBase()) {
      status.textContent = "The lock-screen push engine is built, but its free Cloudflare service still needs to be deployed.";
      button.textContent = "Push Engine Not Deployed Yet";
      button.disabled = true;
      return false;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      status.textContent = "This browser does not support the required push features.";
      return false;
    }

    try {
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") {
        status.textContent = "Notification permission was not granted.";
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      const { publicKey } = await api("/api/vapid-public-key");
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64urlToUint8Array(publicKey),
        });
      }
      await api("/api/subscribe", {
        method: "POST",
        body: JSON.stringify(subscription.toJSON()),
      });

      status.textContent = "Lock-screen cues are enabled. Start a session, then lock the iPhone.";
      button.textContent = "Lock-Screen Cues Enabled";
      button.disabled = true;
      return true;
    } catch (error) {
      console.error("Enter Now push setup failed", error);
      status.textContent = error.message || "Could not connect to the push service.";
      return false;
    }
  }

  async function startRemoteSession() {
    if (!apiBase()) return;
    const min = Math.max(0.1, Number($("minInterval")?.value) || 5);
    const max = Math.max(min, Number($("maxInterval")?.value) || 15);
    try {
      await api("/api/session/start", {
        method: "POST",
        body: JSON.stringify({ minMinutes: min, maxMinutes: max }),
      });
      console.info("Enter Now lock-screen session started");
    } catch (error) {
      console.warn("Lock-screen scheduler could not start", error);
      const status = $("lockStatus");
      if (status) status.textContent = "Session is running locally; lock-screen scheduler is unavailable.";
    }
  }

  async function stopRemoteSession() {
    if (!apiBase()) return;
    try {
      await api("/api/session/stop", { method: "POST" });
    } catch (error) {
      console.warn("Lock-screen scheduler could not stop", error);
    }
  }

  function init() {
    const card = $("lockCard");
    if (!card) return;
    card.classList.add("ready");

    const button = $("enableNotifications");
    if (button) {
      button.onclick = enable;
      enable();
    }

    $("startBtn")?.addEventListener("click", () => {
      // Let the normal Enter Now session start immediately; the remote scheduler
      // is deliberately fire-and-forget so network latency never blocks the UI.
      startRemoteSession();
    });
    $("endBtn")?.addEventListener("click", () => stopRemoteSession());
    $("restartBtn")?.addEventListener("click", async () => {
      await stopRemoteSession();
      startRemoteSession();
    });
  }

  window.EnterNowPush = { enable, startRemoteSession, stopRemoteSession };
  window.addEventListener("load", init, { once: true });
})();
