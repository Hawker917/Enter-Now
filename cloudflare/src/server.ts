import { Agent, callable, getAgentByName, routeAgentRequest } from "agents";
import webpush from "web-push";

type Subscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

type Session = {
  id: string;
  running: boolean;
  minMinutes: number;
  maxMinutes: number;
  cueNumber: number;
  startedAt: number;
  scheduleId?: string;
};

type AgentState = {
  subscriptions: Subscription[];
  session: Session | null;
};

function nextDelaySeconds(minMinutes: number, maxMinutes: number) {
  const min = Math.max(0.1, Number(minMinutes) || 5);
  const max = Math.max(min, Number(maxMinutes) || min);
  return Math.round((min + Math.random() * (max - min)) * 60);
}

export class ReminderAgent extends Agent<Env, AgentState> {
  initialState: AgentState = { subscriptions: [], session: null };

  @callable()
  async getVapidPublicKey() { return this.env.VAPID_PUBLIC_KEY; }

  @callable()
  async subscribe(subscription: Subscription) {
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) throw new Error("Invalid push subscription");
    const subscriptions = this.state.subscriptions.filter((s) => s.endpoint !== subscription.endpoint);
    this.setState({ ...this.state, subscriptions: [...subscriptions, subscription] });
    return { ok: true };
  }

  @callable()
  async unsubscribe(endpoint: string) {
    this.setState({ ...this.state, subscriptions: this.state.subscriptions.filter((s) => s.endpoint !== endpoint) });
    return { ok: true };
  }

  @callable()
  async startSession(minMinutes: number, maxMinutes: number) {
    if (this.state.session?.scheduleId) await this.cancelSchedule(this.state.session.scheduleId);
    const min = Math.max(0.1, Number(minMinutes) || 5);
    const session: Session = {
      id: crypto.randomUUID(), running: true, minMinutes: min,
      maxMinutes: Math.max(min, Number(maxMinutes) || min), cueNumber: 0, startedAt: Date.now(),
    };
    this.setState({ ...this.state, session });
    await this.scheduleNextCue(session.id);
    return { ok: true, sessionId: session.id };
  }

  @callable()
  async stopSession() {
    const session = this.state.session;
    if (session?.scheduleId) await this.cancelSchedule(session.scheduleId);
    this.setState({ ...this.state, session: null });
    return { ok: true };
  }

  private async scheduleNextCue(sessionId: string) {
    const session = this.state.session;
    if (!session?.running || session.id !== sessionId) return;
    const delay = nextDelaySeconds(session.minMinutes, session.maxMinutes);
    const schedule = await this.schedule(delay, "sendCue", { sessionId }, { idempotent: false });
    this.setState({ ...this.state, session: { ...session, scheduleId: schedule.id } });
  }

  async sendCue(payload: { sessionId: string }) {
    const session = this.state.session;
    if (!session?.running || session.id !== payload.sessionId) return;
    webpush.setVapidDetails(this.env.VAPID_SUBJECT, this.env.VAPID_PUBLIC_KEY, this.env.VAPID_PRIVATE_KEY);
    const cueNumber = session.cueNumber + 1;
    const deadEndpoints: string[] = [];
    await Promise.all(this.state.subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, JSON.stringify({
          title: "Enter Now", body: "Beep-Boop — Enter Now.",
          tag: `enter-now-cue-${session.id}-${cueNumber}`, cue: true, cueNumber,
        }), { TTL: 120, urgency: "high" });
      } catch (error) {
        const status = error instanceof webpush.WebPushError ? error.statusCode : 0;
        if (status === 404 || status === 410) deadEndpoints.push(subscription.endpoint);
        if (status >= 500) console.error("Temporary push failure", status);
      }
    }));
    this.setState({
      ...this.state,
      subscriptions: this.state.subscriptions.filter((s) => !deadEndpoints.includes(s.endpoint)),
      session: { ...session, cueNumber, scheduleId: undefined },
    });
    await this.scheduleNextCue(session.id);
  }
}

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Enter-Now-Device",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
}

function deviceId(request: Request) {
  const value = request.headers.get("X-Enter-Now-Device") || "default";
  return /^[a-zA-Z0-9_-]{8,80}$/.test(value) ? value : "default";
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

    if (url.pathname.startsWith("/api/")) {
      const agent = await getAgentByName(env.ReminderAgent, deviceId(request));
      try {
        if (url.pathname === "/api/vapid-public-key" && request.method === "GET") return json({ publicKey: await agent.getVapidPublicKey() }, 200, origin);
        if (url.pathname === "/api/subscribe" && request.method === "POST") return json(await agent.subscribe(await request.json() as Subscription), 200, origin);
        if (url.pathname === "/api/unsubscribe" && request.method === "POST") {
          const body = await request.json() as { endpoint?: string };
          return json(await agent.unsubscribe(body.endpoint || ""), 200, origin);
        }
        if (url.pathname === "/api/session/start" && request.method === "POST") {
          const body = await request.json() as { minMinutes?: number; maxMinutes?: number };
          return json(await agent.startSession(body.minMinutes ?? 5, body.maxMinutes ?? 15), 200, origin);
        }
        if (url.pathname === "/api/session/stop" && request.method === "POST") return json(await agent.stopSession(), 200, origin);
        return json({ error: "Not found" }, 404, origin);
      } catch (error) {
        console.error(error);
        return json({ error: error instanceof Error ? error.message : "Request failed" }, 400, origin);
      }
    }

    return (await routeAgentRequest(request, env, { cors: true })) ?? new Response("Not found", { status: 404 });
  },
};

interface Env {
  ReminderAgent: DurableObjectNamespace<ReminderAgent>;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}
