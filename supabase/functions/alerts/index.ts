// alerts: daily maintenance/recall digest emailed to the fleet owner + family members.
// Deploy with name `alerts` and JWT verification OFF (self-auths: cron secret, or a
// user JWT for the in-app "send test" path). Secrets: RESEND_API_KEY (resend.com),
// GDRIVE_CRON_SECRET (same shared cron secret as google-drive).
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const CRON_SECRET = Deno.env.get("GDRIVE_CRON_SECRET") ?? "";
const FROM = Deno.env.get("ALERT_FROM") ?? "MotorLog <onboarding@resend.dev>";
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// --- same thresholds as src/lib/calc.js ---
function maintStatus(item: any, odo: number, today = new Date()) {
  if (item.last_done_miles == null && item.last_done_date == null) return null;
  let remainMiles: number | null = null;
  if (item.interval_miles && item.last_done_miles != null) {
    remainMiles = item.last_done_miles + item.interval_miles - odo;
  }
  let remainDays: number | null = null;
  if (item.interval_months && item.last_done_date) {
    const d = new Date(item.last_done_date);
    d.setMonth(d.getMonth() + item.interval_months);
    remainDays = Math.round((d.getTime() - today.getTime()) / 86400000);
  }
  const overdue = (remainMiles != null && remainMiles <= 0) || (remainDays != null && remainDays <= 0);
  const soon = (remainMiles != null && remainMiles <= 1000) || (remainDays != null && remainDays <= 30);
  if (!overdue && !soon) return null;
  return { level: overdue ? "OVERDUE" : "DUE SOON", remainMiles, remainDays };
}

type NotifRow = { user_id: string; vehicle_id: string | null; kind: string; dedupe_key: string; message: string };

async function buildDigest(ownerId: string) {
  const rows = (q: any) => q.then((r: any) => r.data ?? []);
  // NOTE: supabase-js resolves (never rejects) on a missing table — rows() then yields []
  // so reminders/notifications not existing yet just make those queries empty, no crash.
  const [vehicles, fuel, svc, maint, recalls, docs, reminders] = await Promise.all([
    rows(admin.from("vehicles").select("*").eq("user_id", ownerId).eq("archived", false).order("sort_order")),
    rows(admin.from("fuel_logs").select("vehicle_id,odometer").eq("user_id", ownerId)),
    rows(admin.from("service_logs").select("vehicle_id,odometer").eq("user_id", ownerId)),
    rows(admin.from("maintenance_items").select("*").eq("user_id", ownerId)),
    rows(admin.from("recalls").select("*").eq("user_id", ownerId).eq("status", "open")),
    rows(admin.from("driver_docs").select("*").eq("user_id", ownerId).not("expires_on", "is", null)),
    rows(admin.from("reminders").select("*").eq("user_id", ownerId).is("completed_at", null)),
  ]).catch(() => [[], [], [], [], [], [], []]);

  const sections: { vehicle_id: string | null; vehicle: string; lines: string[] }[] = [];
  // one inbox row per digest item, deduped by dedupe_key (feature b)
  const notif: NotifRow[] = [];
  const today = new Date();

  for (const v of vehicles) {
    const odo = Math.max(v.base_odometer ?? 0,
      ...fuel.filter((r: any) => r.vehicle_id === v.id).map((r: any) => r.odometer),
      ...svc.filter((r: any) => r.vehicle_id === v.id).map((r: any) => r.odometer ?? 0), 0);
    const lines: string[] = [];
    for (const r of recalls.filter((r: any) => r.vehicle_id === v.id)) {
      const msg = `RECALL OPEN — ${(r.component || "").split(":").pop() || "recall"} (NHTSA ${r.campaign})`;
      lines.push(msg);
      notif.push({ user_id: ownerId, vehicle_id: v.id, kind: "recall", dedupe_key: `digest:recall:${r.campaign}`, message: msg });
    }
    for (const m of maint.filter((m: any) => m.vehicle_id === v.id)) {
      const st = maintStatus(m, odo, today);
      if (!st) continue;
      const bits = [];
      if (st.remainMiles != null) bits.push(st.remainMiles <= 0 ? `${Math.abs(st.remainMiles).toLocaleString()} mi over` : `${st.remainMiles.toLocaleString()} mi left`);
      if (st.remainDays != null) bits.push(st.remainDays <= 0 ? `${Math.abs(st.remainDays)} days over` : `${st.remainDays} days left`);
      const msg = `${st.level} — ${m.name} (${bits.join(", ")})${m.part_number ? ` [PN ${m.part_number}]` : ""}`;
      lines.push(msg);
      // stable "due target" so the key is unchanged until the item is actually serviced/rolled
      let dueKey: string;
      if (st.remainMiles != null) dueKey = `${(m.last_done_miles ?? 0) + (m.interval_miles ?? 0)}mi`;
      else { const d = new Date(m.last_done_date); d.setMonth(d.getMonth() + (m.interval_months ?? 0)); dueKey = d.toISOString().slice(0, 10); }
      notif.push({ user_id: ownerId, vehicle_id: v.id, kind: "maintenance", dedupe_key: `digest:maint:${m.id}:${dueKey}`, message: msg });
    }
    if (lines.length) sections.push({ vehicle_id: v.id, vehicle: `${v.name}${v.nickname ? ` "${v.nickname}"` : ""} @ ${odo.toLocaleString()} mi`, lines });
  }

  // user-defined reminders (registration, inspection, seasonal) — each within its own window
  for (const rm of reminders ?? []) {
    const days = Math.round((new Date(rm.due_date).getTime() - today.getTime()) / 86400000);
    if (days > (rm.remind_days_before ?? 14)) continue;   // still outside its reminder window
    const veh = vehicles.find((v: any) => v.id === rm.vehicle_id);
    const level = days < 0 ? "OVERDUE" : "DUE SOON";
    const when = days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? "due today" : `in ${days} days`;
    const msg = `${level} — ${rm.title} (${when}, ${rm.due_date})`;
    if (rm.vehicle_id && veh) {
      let sec = sections.find((s) => s.vehicle_id === veh.id);
      if (!sec) { sec = { vehicle_id: veh.id, vehicle: `${veh.name}${veh.nickname ? ` "${veh.nickname}"` : ""}`, lines: [] }; sections.push(sec); }
      sec.lines.push(msg);
    } else {
      let sec = sections.find((s) => s.vehicle_id === null);
      if (!sec) { sec = { vehicle_id: null, vehicle: "Fleet-wide", lines: [] }; sections.push(sec); }
      sec.lines.push(msg);
    }
    notif.push({ user_id: ownerId, vehicle_id: (rm.vehicle_id && veh) ? rm.vehicle_id : null, kind: "reminder", dedupe_key: `digest:reminder:${rm.id}:${rm.due_date}`, message: msg });
  }

  // expiring glovebox documents — attached to their vehicle's section (or fleet-wide)
  for (const d of docs ?? []) {
    const days = Math.round((new Date(d.expires_on).getTime() - Date.now()) / 86400000);
    if (days > 30) continue;
    const veh = vehicles.find((v: any) => v.id === d.vehicle_id);
    const line = `${days < 0 ? "OVERDUE" : "DUE SOON"} — ${d.label || d.kind} (${d.holder}${veh ? `, ${veh.name}` : ""}) ${days < 0 ? `expired ${d.expires_on}` : `expires ${d.expires_on}`}`;
    if (veh) {
      let sec = sections.find((s) => s.vehicle_id === veh.id);
      if (!sec) { sec = { vehicle_id: veh.id, vehicle: veh.name, lines: [] }; sections.push(sec); }
      sec.lines.push(line);
    } else {
      let sec = sections.find((s) => s.vehicle_id === null);
      if (!sec) { sec = { vehicle_id: null, vehicle: "Documents (fleet-wide)", lines: [] }; sections.push(sec); }
      sec.lines.push(line);
    }
    notif.push({ user_id: ownerId, vehicle_id: d.vehicle_id ?? null, kind: "document", dedupe_key: `digest:document:${d.id}:${d.expires_on}`, message: line });
  }
  return { sections, notif };
}

// idempotent inbox insert via PostgREST on-conflict-do-nothing (feature b). Swallows ALL errors,
// including the table not existing yet — the inbox is best-effort, it must never fail the run.
async function insertNotifications(items: NotifRow[]) {
  if (!items.length) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications?on_conflict=dedupe_key`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(items),
    });
  } catch (e) {
    console.error("[alerts] inbox insert failed:", String(e));
  }
}

// Push one digest (or a test) to a single webhook provider. 5s timeout; throws on network
// failure or non-2xx so callers can log (digest) or surface (test). Never called without a caught scope.
async function sendToProvider(prov: any, lines: string[]) {
  const url = prov?.config?.url;
  if (!url) throw new Error("provider has no url configured");
  const n = lines.length;
  const plural = n === 1 ? "" : "s";
  let opts: RequestInit;
  if (prov.type === "ntfy") {
    // ntfy headers must be latin-1 safe, so the Title uses a hyphen (not an em dash).
    opts = {
      method: "POST",
      headers: { Title: `MotorLog - ${n} item${plural} need attention`, Priority: "default", Tags: "wrench" },
      body: lines.join("\n"),
    };
  } else if (prov.type === "discord") {
    opts = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: ("**MotorLog**\n" + lines.join("\n")).slice(0, 1900) }),
    };
  } else { // generic webhook
    opts = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `MotorLog — ${n} item${plural} need attention`, items: lines }),
    };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${prov.type} responded ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

// Dispatch the digest summary to the OWNER's enabled webhook providers (feature c, v1 scope).
// Owner-scoped: they see every fleet item. Failures are logged, never thrown.
async function dispatchProviders(ownerId: string, sections: { lines: string[] }[]) {
  const lines = sections.flatMap((s) => s.lines);
  if (!lines.length) return;
  const providers = await admin.from("notification_providers").select("*")
    .eq("user_id", ownerId).eq("enabled", true)
    .then((r: any) => r.data ?? [], () => []);
  for (const p of providers) {
    try { await sendToProvider(p, lines); }
    catch (e) { console.error(`[alerts] provider ${p.id} (${p.type}) dispatch failed:`, String(e)); }
  }
}

function renderEmail(sections: { vehicle: string; lines: string[] }[]) {
  const rows = sections.map((s) => `
    <h3 style="margin:18px 0 6px;font:600 15px monospace;color:#111">${s.vehicle}</h3>
    <ul style="margin:0;padding-left:18px">${s.lines.map((l) =>
      `<li style="font:13px monospace;color:${l.startsWith("OVERDUE") || l.startsWith("RECALL") ? "#C0261B" : "#8a6d00"};margin:4px 0">${l}</li>`).join("")}
    </ul>`).join("");
  return `<div style="max-width:560px;margin:0 auto;padding:20px;background:#fff">
    <p style="font:700 18px monospace;letter-spacing:2px;color:#111">/// MOTORLOG</p>
    <p style="font:13px monospace;color:#444">Maintenance &amp; recall alerts for your fleet:</p>
    ${rows}
    <p style="font:11px monospace;color:#999;margin-top:22px">Sent by MotorLog — motorlog.netlify.app.
    Log the service in the app to clear an item.</p></div>`;
}

async function allRecipientEmails(ownerId: string) {
  const to = new Set<string>();
  const { data: owner } = await admin.auth.admin.getUserById(ownerId);
  if (owner?.user?.email) to.add(owner.user.email);
  const { data: members } = await admin.from("fleet_members").select("member_email").eq("owner_user_id", ownerId);
  for (const m of members ?? []) to.add(m.member_email);
  return [...to];
}

// recipient pref value: false | true | { enabled, vehicles: null | [vehicle ids] }
function normRecipient(v: unknown): { enabled: boolean; vehicles: string[] | null } {
  if (v === false) return { enabled: false, vehicles: null };
  if (v === true || v == null) return { enabled: true, vehicles: null };
  const o = v as any;
  return { enabled: o.enabled !== false, vehicles: o.vehicles ?? null };
}

async function runForOwner(ownerId: string, force = false) {
  // preferences: frequency + recipient exclusions (default: weekly, everyone)
  const { data: prefs } = await admin.from("alert_prefs").select("*").eq("user_id", ownerId).maybeSingle()
    .then((r: any) => r, () => ({ data: null }));
  const freq = prefs?.frequency ?? "weekly";
  if (!force && freq === "off") return { sent: false, reason: "alerts off" };

  const { sections, notif } = await buildDigest(ownerId);
  if (!sections.length) return { sent: false, reason: "nothing due" };
  // in-app inbox is populated on every build (idempotent), independent of email throttling
  await insertNotifications(notif);
  const hash = JSON.stringify(sections);
  const { data: state } = await admin.from("alert_state").select("last_hash").eq("user_id", ownerId).maybeSingle();

  if (!force) {
    const now = new Date();
    const due =
      freq === "daily" ? true :
      freq === "weekly" ? now.getUTCDay() === 1 :          // Mondays
      freq === "monthly" ? now.getUTCDate() === 1 :        // 1st of the month
      /* urgent */ state?.last_hash !== hash;              // only when something changed
    if (!due) return { sent: false, reason: `waiting (${freq})` };
    if (freq !== "urgent" && state?.last_hash === hash && (freq === "daily")) {
      // daily still skips exact repeats to avoid inbox noise
      return { sent: false, reason: "unchanged" };
    }
  }

  // webhook push (ntfy / Discord / generic) to the owner's channels — alongside email,
  // fired once the digest is due; runs even if Resend isn't configured (push-only setups).
  await dispatchProviders(ownerId, sections);

  if (!RESEND_KEY) return { sent: false, reason: "RESEND_API_KEY not set" };

  // per-recipient vehicle scope: group identical scopes, send one email per group
  const emails = await allRecipientEmails(ownerId);
  const scoped = emails
    .map((e) => ({ email: e, ...normRecipient(prefs?.recipients?.[e.toLowerCase()] ?? prefs?.recipients?.[e]) }))
    .filter((r) => r.enabled);
  if (!scoped.length) return { sent: false, reason: "no recipients enabled" };

  const groups = new Map<string, { vehicles: string[] | null; emails: string[] }>();
  for (const r of scoped) {
    const key = r.vehicles ? [...r.vehicles].sort().join(",") : "all";
    if (!groups.has(key)) groups.set(key, { vehicles: r.vehicles, emails: [] });
    groups.get(key)!.emails.push(r.email);
  }

  const delivered: { to: string[]; items: number }[] = [];
  for (const g of groups.values()) {
    const secs = g.vehicles
      ? sections.filter((s) => s.vehicle_id === null || g.vehicles!.includes(s.vehicle_id))
      : sections;
    if (!secs.length) continue;
    const n = secs.reduce((s, x) => s + x.lines.length, 0);
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: g.emails,
        subject: `MotorLog: ${n} item${n > 1 ? "s" : ""} need attention`,
        html: renderEmail(secs),
      }),
    });
    if (r.ok) delivered.push({ to: g.emails, items: n });
    else {
      const res = await r.json().catch(() => ({}));
      return { sent: false, reason: `Resend: ${(res as any).message ?? r.status}` };
    }
  }
  if (!delivered.length) return { sent: false, reason: "nothing due for enabled recipients' vehicles" };
  await admin.from("alert_state").upsert({ user_id: ownerId, last_hash: hash, last_sent_at: new Date().toISOString() });
  return { sent: true, to: delivered.flatMap((d) => d.to), groups: delivered };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));

    if (req.headers.get("x-cron-secret") === CRON_SECRET && CRON_SECRET) {
      const { data: owners } = await admin.from("vehicles").select("user_id");
      const uniq = [...new Set((owners ?? []).map((o: any) => o.user_id))];
      const results: Record<string, unknown> = {};
      for (const id of uniq) {
        try { results[id] = await runForOwner(id as string); }
        catch (e) { results[id] = { error: String(e) }; }
      }
      return json({ results });
    }

    // user-initiated (test / send-now): resolve the caller, alert their fleet's owner set
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data } = await admin.auth.getUser(jwt);
    if (!data?.user) return json({ error: "unauthorized" }, 401);

    // in-app "test channel" button: send one message to a provider owned by the caller
    if (body.action === "test-provider") {
      const { data: prov } = await admin.from("notification_providers")
        .select("*").eq("id", body.provider_id).eq("user_id", data.user.id).maybeSingle();
      if (!prov) return json({ error: "provider not found" }, 404);
      try { await sendToProvider(prov, ["MotorLog test — channel working"]); return json({ ok: true }); }
      catch (e) { return json({ error: String((e as Error)?.message ?? e) }); }
    }

    const { data: v } = await admin.from("vehicles").select("user_id").limit(1);
    const ownerId = body.owner_id ?? v?.[0]?.user_id ?? data.user.id;
    return json(await runForOwner(ownerId, true));
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
