/* Enter Now Web Push bridge. */
(() => {
  "use strict";

  const PUSH_API = "https://enter-now.pixeldriver777.workers.dev";
  const SETUP_KEY = "enterNowPushEnabled";
  const INSTALL_KEY = "enterNowInstallSeen";
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

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
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

  function showInstallGuide() {
    if (!isIOS() || isStandalone() || localStorage.getItem(INSTALL_KEY) === "1") return;
    if (document.getElementById("enterNowInstallGuide")) return;

    const style = document.createElement("style");
    style.id = "enterNowInstallGuideStyle";
    style.textContent = `#enterNowInstallGuide{position:fixed;inset:0;z-index:10001;display:grid;place-items:center;padding:20px;background:rgba(5,6,8,.84);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}#enterNowInstallGuide .box{width:min(430px,100%);background:#191c22;border:1px solid rgba(255,255,255,.1);border-radius:22px;padding:28px 24px;box-shadow:0 25px 80px rgba(0,0,0,.5)}#enterNowInstallGuide h2{margin:0 0 10px;font-size:24px}#enterNowInstallGuide p{line-height:1.5;opacity:.78}#enterNowInstallGuide .steps{margin:18px 0;padding-left:24px;line-height:1.8}#enterNowInstallGuide button{width:100%;margin-top:8px;background:#f1f2f4;color:#101216;font-weight:750}`;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "enterNowInstallGuide";
    overlay.innerHTML = `<div class="box"><h2>One-time setup</h2><p>Enter Now needs to be added to your Home Screen once so iPhone can treat it like an app and deliver lock-screen reminders.</p><ol class="steps"><li>Tap Safari's <strong>Share</strong> button.</li><li>Choose <strong>Add to Home Screen</strong>.</li><li>Open <strong>Enter Now</strong> from the new Home Screen icon.</li></ol><button id="enterNowInstallDone" type="button">I've added Enter Now</button></div>`;
    document.body.appendChild(overlay);
    $("enterNowInstallDone").onclick = () => {
      localStorage.setItem(INSTALL_KEY, "1");
      overlay.remove();
      setCardVisible(false);
    };
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
        if (status) status.textContent = "Allow notifications once to enable lock-screen cues.";
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
      markEnabled();
      return;
    }

    if (standalone && permission === "granted") {
      await enable({prompt: false});
      return;
    }

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
    if (isIOS() && !isStandalone()) showInstallGuide();
  }

  window.EnterNowPush = { enable, startRemoteSession, stopRemoteSession };

  window.addEventListener("load", () => {
    bind();
    setTimeout(bind, 750);
    setTimeout(bind, 2000);
  }, { once: true });
})();
