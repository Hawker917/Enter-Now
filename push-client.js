/* Enter Now Web Push bridge. */
(() => {
  "use strict";

  const PUSH_API = "https://enter-now.pixeldriver777.workers.dev";
  const SETUP_KEY = "enterNowPushEnabled";
  const apiBase = () => (window.ENTER_NOW_PUSH_API || localStorage.getItem("enterNowPushApi") || PUSH_API).replace(/\/$/, "");
  const deviceId = () => {
    let id = localStorage.getItem("enterNowDeviceId");
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem("enterNowDeviceId", id);
    }
    return id;
  };
  const $ = (id) => document.getElementById(id);

  function base64urlToUint8Array(value) {
    const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function isStandalone() {
    return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function setCardVisible(visible) {
    const card = $("lockCard");
    if (!card) return;
    if (visible) card.classList.add("ready");
    else card.classList.remove("ready");
  }

  function markEnabled() {
    localStorage.setItem(SETUP_KEY, "1");
    setCardVisible(false);
  }

  async function api(path, options = {}) {
    const response = await fetch(apiBase() + path, {
      ...options,
      headers: { "Content-Type": "application/json", "X-Enter-Now-Device": deviceId(), ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Push service returned ${response.status}`);
    return data;
  }

  async function enable({prompt = true} = {}) {
    const status = $("lockStatus");
    const button = $("enableNotifications");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      if (status) status.textContent = "This browser does not support the required push features.";
      return false;
    }
    try {
      let permission = Notification.permission;
      if (permission !== "granted" && prompt) permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setCardVisible(true);
        if (status) status.textContent = "One-time permission is required for lock-screen cues.";
        if (button) button.disabled = false;
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      const { publicKey } = await api("/api/vapid-public-key");
      if (!publicKey) throw new Error("Push service did not return a VAPID public key.");
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64urlToUint8Array(publicKey),
        });
      }

      await api("/api/subscribe", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
      markEnabled();
      return true;
    } catch (error) {
      console.error("Enter Now push setup failed", error);
      setCardVisible(true);
      if (status) status.textContent = error.message || "Could not connect to the push service.";
      if (button) button.disabled = false;
      return false;
    }
  }

  async function restorePushState() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;

    const standalone = isStandalone();
    const permission = Notification.permission;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (permission === "granted" && subscription) {
      // The browser already remembers permission and the subscription.
      // Do not make the user reconnect it on every launch.
      markEnabled();
      return;
    }

    if (standalone && permission === "granted") {
      // Repair/re-register silently if iOS/browser lost the local subscription.
      await enable({prompt: false});
      return;
    }

    // Only show setup when a genuine one-time action is still required.
    setCardVisible(true);
  }

  async function startRemoteSession() {
    try {
      const min = Math.max(0.1, Number($("minInterval")?.value) || 5);
      const max = Math.max(min, Number($("maxInterval")?.value) || 15);
      await api("/api/session/start", { method: "POST", body: JSON.stringify({ minMinutes: min, maxMinutes: max }) });
    } catch (error) {
      console.warn("Lock-screen scheduler could not start", error);
    }
  }

  async function stopRemoteSession() {
    try { await api("/api/session/stop", { method: "POST" }); }
    catch (error) { console.warn("Lock-screen scheduler could not stop", error); }
  }

  function bind() {
    const card = $("lockCard");
    if (!card) return;
    const button = $("enableNotifications");
    if (button) {
      button.onclick = () => enable({prompt: true});
      button.disabled = false;
    }
    $("startBtn")?.addEventListener("click", () => startRemoteSession());
    $("endBtn")?.addEventListener("click", () => stopRemoteSession());
    $("restartBtn")?.addEventListener("click", async () => { await stopRemoteSession(); startRemoteSession(); });
    restorePushState().catch((error) => console.warn("Could not restore push state", error));
  }

  window.EnterNowPush = { enable, startRemoteSession, stopRemoteSession };

  window.addEventListener("load", () => {
    bind();
    setTimeout(bind, 750);
    setTimeout(bind, 2000);
  }, { once: true });
})();
