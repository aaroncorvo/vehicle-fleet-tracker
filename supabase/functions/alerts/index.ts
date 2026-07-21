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

async function buildDigest(ownerId: string) {
  const [vehicles, fuel, svc, maint, recalls] = await Promise.all([
    admin.from("vehicles").select("*").eq("user_id", ownerId).eq("archived", false).order("sort_order"),
    admin.from("fuel_logs").select("vehicle_id,odometer").eq("user_id", ownerId),
    admin.from("service_logs").select("vehicle_id,odometer").eq("user_id", ownerId),
    admin.from("maintenance_items").select("*").eq("user_id", ownerId),
    admin.from("recalls").select("*").eq("user_id", ownerId).eq("status", "open"),
  ].map((p) => p.then((r: any) => r.data ?? [])) as any;

  const sections: { vehicle: string; lines: string[] }[] = [];
  for (const v of vehicles) {
    const odo = Math.max(v.base_odometer ?? 0,
      ...fuel.filter((r: any) => r.vehicle_id === v.id).map((r: any) => r.odometer),
      ...svc.filter((r: any) => r.vehicle_id === v.id).map((r: any) => r.odometer ?? 0), 0);
    const lines: string[] = [];
    for (const r of recalls.filter((r: any) => r.vehicle_id === v.id)) {
      lines.push(`RECALL OPEN — ${(r.component || "").split(":").pop() || "recall"} (NHTSA ${r.campaign})`);
    }
    for (const m of maint.filter((m: any) => m.vehicle_id === v.id)) {
      const st = maintStatus(m, odo);
      if (!st) continue;
      const bits = [];
      if (st.remainMiles != null) bits.push(st.remainMiles <= 0 ? `${Math.abs(st.remainMiles).toLocaleString()} mi over` : `${st.remainMiles.toLocaleString()} mi left`);
      if (st.remainDays != null) bits.push(st.remainDays <= 0 ? `${Math.abs(st.remainDays)} days over` : `${st.remainDays} days left`);
      lines.push(`${st.level} — ${m.name} (${bits.join(", ")})${m.part_number ? ` [PN ${m.part_number}]` : ""}`);
    }
    if (lines.length) sections.push({ vehicle: `${v.name}${v.nickname ? ` "${v.nickname}"` : ""} @ ${odo.toLocaleString()} mi`, lines });
  }
  return sections;
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

async function recipientsFor(ownerId: string) {
  const to = new Set<string>();
  const { data: owner } = await admin.auth.admin.getUserById(ownerId);
  if (owner?.user?.email) to.add(owner.user.email);
  const { data: members } = await admin.from("fleet_members").select("member_email").eq("owner_user_id", ownerId);
  for (const m of members ?? []) to.add(m.member_email);
  return [...to];
}

async function runForOwner(ownerId: string, force = false) {
  const sections = await buildDigest(ownerId);
  if (!sections.length) return { sent: false, reason: "nothing due" };
  const hash = JSON.stringify(sections);
  const { data: state } = await admin.from("alert_state").select("last_hash").eq("user_id", ownerId).maybeSingle();
  if (!force && state?.last_hash === hash) return { sent: false, reason: "unchanged" };
  if (!RESEND_KEY) return { sent: false, reason: "RESEND_API_KEY not set" };

  const to = await recipientsFor(ownerId);
  const n = sections.reduce((s, x) => s + x.lines.length, 0);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM, to,
      subject: `MotorLog: ${n} item${n > 1 ? "s" : ""} need attention`,
      html: renderEmail(sections),
    }),
  });
  const res = await r.json();
  if (!r.ok) return { sent: false, reason: `Resend: ${res.message ?? r.status}` };
  await admin.from("alert_state").upsert({ user_id: ownerId, last_hash: hash, last_sent_at: new Date().toISOString() });
  return { sent: true, to, items: n };
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
    const { data: v } = await admin.from("vehicles").select("user_id").limit(1);
    const ownerId = body.owner_id ?? v?.[0]?.user_id ?? data.user.id;
    return json(await runForOwner(ownerId, true));
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
