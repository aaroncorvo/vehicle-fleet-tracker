// google-drive: embedded Google Drive backup for Fleet Tracker.
// Deploy with name `google-drive` and JWT VERIFICATION **OFF** (this function
// authenticates requests itself: user JWT for app actions, x-cron-secret for
// the scheduled daily backup).
// Required secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GDRIVE_CRON_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const CRON_SECRET = Deno.env.get("GDRIVE_CRON_SECRET") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------- Google API helpers ----------
async function tokenRequest(params: Record<string, string>) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Google token error: ${d.error_description ?? d.error}`);
  return d;
}
const accessFromRefresh = async (refresh_token: string) =>
  (await tokenRequest({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token, grant_type: "refresh_token" })).access_token as string;

async function gapi(access: string, url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${access}`, ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`Drive API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function findByName(access: string, name: string, parent?: string, mime?: string) {
  const q = [
    `name='${name.replace(/'/g, "\\'")}'`,
    "trashed=false",
    parent ? `'${parent}' in parents` : null,
    mime ? `mimeType='${mime}'` : null,
  ].filter(Boolean).join(" and ");
  const d = await gapi(access, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
  return d.files?.[0]?.id as string | undefined;
}

async function ensureFolder(access: string, name: string, parent?: string) {
  const existing = await findByName(access, name, parent, "application/vnd.google-apps.folder");
  if (existing) return existing;
  const d = await gapi(access, "https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: parent ? [parent] : undefined }),
  });
  return d.id as string;
}

async function uploadFile(access: string, parent: string, name: string, mime: string, data: Uint8Array | string) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const existing = await findByName(access, name, parent);
  if (existing) {
    await gapi(access, `https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=media`, {
      method: "PATCH", headers: { "Content-Type": mime }, body: bytes,
    });
    return existing;
  }
  const boundary = "fleetbk" + crypto.randomUUID().slice(0, 8);
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, parents: [parent] }) +
    `\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head); body.set(bytes, head.length); body.set(tail, head.length + bytes.length);
  const d = await gapi(access, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  return d.id as string;
}

// ---------- backup content builders ----------
const csvEsc = (v: unknown) =>
  v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
const toCsv = (rows: Record<string, unknown>[], cols: string[]) =>
  [cols.join(","), ...rows.map((r) => cols.map((c) => csvEsc(r[c])).join(","))].join("\n");
const money = (v: unknown) => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function vehicleRecord(v: any, fuel: any[], svc: any[], maint: any[]) {
  const odo = Math.max(v.base_odometer ?? 0, ...fuel.map((r) => r.odometer), ...svc.map((r) => r.odometer ?? 0), 0);
  const fuelSpend = fuel.reduce((s, r) => s + Number(r.total_cost ?? 0), 0);
  const svcSpend = svc.reduce((s, r) => s + Number(r.cost ?? 0), 0);
  const md: string[] = [`# ${v.year} ${v.make} ${v.model}` + (v.nickname ? ` "${v.nickname}"` : "")];
  md.push("\n_Vehicle record from Fleet Tracker (motorlog.netlify.app)_\n", "## Identity");
  const idRows: [string, unknown][] = [["VIN", v.vin], ["Engine", v.engine], ["Color", v.color], ["Plate", v.plate],
    ["Primary driver", v.primary_driver], ["Fuel", v.fuel_octane], ["Current odometer", `${odo.toLocaleString()} mi`]];
  for (const [k, val] of idRows) if (val) md.push(`- **${k}:** ${val}`);
  if (v.purchase_date || v.purchase_price) {
    md.push("\n## Purchase");
    if (v.purchase_date) md.push(`- **Date:** ${v.purchase_date}`);
    if (v.purchase_price) md.push(`- **Price:** ${money(v.purchase_price)}`);
  }
  if (v.notes) md.push("\n## Specs & Quick Reference\n```\n" + v.notes + "\n```");
  md.push("\n## Cost Summary",
    `- **Documented service spend:** ${money(svcSpend)} (${svc.length} entries)`,
    `- **Fuel logged:** ${money(fuelSpend)} (${fuel.length} fills)`);
  if (svc.length) {
    md.push("\n## Service History");
    for (const r of svc) {
      md.push(`\n### ${r.serviced_at} — ${r.service_type}` + (r.cost ? ` (${money(r.cost)})` : ""));
      if (r.shop) md.push(`- Shop: ${r.shop}`);
      if (r.odometer) md.push(`- Odometer: ${Number(r.odometer).toLocaleString()} mi`);
      if (r.parts) md.push(`- Parts: ${r.parts}`);
      if (r.notes) md.push(`- Notes: ${r.notes}`);
    }
  }
  if (maint.length) {
    md.push("\n## Maintenance Intervals");
    for (const r of maint) {
      const iv = [r.interval_miles ? `${Number(r.interval_miles).toLocaleString()} mi` : null,
        r.interval_months ? `${r.interval_months} mo` : null].filter(Boolean).join(" / ");
      const last = [r.last_done_miles ? `${Number(r.last_done_miles).toLocaleString()} mi` : null,
        r.last_done_date].filter(Boolean).join(" / ") || "no baseline";
      md.push(`- **${r.name}**${r.part_number ? ` [PN ${r.part_number}]` : ""} — every ${iv || "n/a"}; last done: ${last}`);
    }
  }
  return md.join("\n");
}

async function runBackup(conn: any) {
  const access = await accessFromRefresh(conn.refresh_token);
  const uid = conn.user_id;
  const [vehicles, fuel, svc, maint, receipts, photos] = await Promise.all([
    admin.from("vehicles").select("*").eq("user_id", uid).order("sort_order"),
    admin.from("fuel_logs").select("*").eq("user_id", uid).order("odometer"),
    admin.from("service_logs").select("*").eq("user_id", uid).order("serviced_at"),
    admin.from("maintenance_items").select("*").eq("user_id", uid).order("name"),
    admin.from("receipts").select("*").eq("user_id", uid),
    admin.from("vehicle_photos").select("*").eq("user_id", uid).order("created_at"),
  ].map((p) => p.then((r: any) => r.data ?? [])) as any);

  // root folder (recreate if the user trashed it)
  let root = conn.folder_id as string;
  try { await gapi(access, `https://www.googleapis.com/drive/v3/files/${root}?fields=id,trashed`); }
  catch { root = await ensureFolder(access, conn.folder_name || "Fleet Records"); }

  let uploaded = 0;
  for (const v of vehicles) {
    const name = `${v.year} ${v.make} ${v.model}`;
    const vf = await ensureFolder(access, name, root);
    const vfuel = fuel.filter((r: any) => r.vehicle_id === v.id);
    const vsvc = svc.filter((r: any) => r.vehicle_id === v.id);
    const vmaint = maint.filter((r: any) => r.vehicle_id === v.id);
    await uploadFile(access, vf, "Vehicle Record.md", "text/markdown", vehicleRecord(v, vfuel, vsvc, vmaint));
    await uploadFile(access, vf, "fuel_history.csv", "text/csv",
      toCsv(vfuel, ["filled_at", "odometer", "fill_type", "gallons", "cost_per_gallon", "total_cost", "octane", "brand", "location", "notes"]));
    await uploadFile(access, vf, "service_history.csv", "text/csv",
      toCsv(vsvc, ["serviced_at", "odometer", "service_type", "parts", "cost", "shop", "notes"]));
    await uploadFile(access, vf, "maintenance_intervals.csv", "text/csv",
      toCsv(vmaint, ["name", "interval_miles", "interval_months", "last_done_miles", "last_done_date", "part_number", "notes"]));
    uploaded += 4;

    const vphot = photos.filter((r: any) => r.vehicle_id === v.id);
    if (vphot.length) {
      const pf = await ensureFolder(access, "Photos", vf);
      for (let i = 0; i < vphot.length; i++) {
        const { data } = await admin.storage.from("vehicle-photos").download(vphot[i].file_path);
        if (!data) continue;
        const fn = `photo_${i + 1}${vphot[i].is_primary ? "_primary" : ""}.jpg`;
        await uploadFile(access, pf, fn, "image/jpeg", new Uint8Array(await data.arrayBuffer()));
        uploaded++;
      }
    }
    const vrec = receipts.filter((r: any) => r.vehicle_id === v.id);
    if (vrec.length) {
      const rf = await ensureFolder(access, "Receipts", vf);
      for (const r of vrec) {
        const { data } = await admin.storage.from("receipts").download(r.file_path);
        if (!data) continue;
        const ext = r.file_path.split(".").pop();
        const fn = `${r.receipt_date ?? "undated"} ${(r.vendor ?? "receipt").replace(/\//g, "-")}` +
          (r.total ? ` $${Number(r.total).toFixed(2)}` : "") + `.${ext}`;
        await uploadFile(access, rf, fn, ext === "pdf" ? "application/pdf" : "image/jpeg", new Uint8Array(await data.arrayBuffer()));
        uploaded++;
      }
    }
  }
  await admin.from("google_drive_connections").update({
    last_backup_at: new Date().toISOString(),
    last_backup_result: `${uploaded} files`,
    folder_id: root,
  }).eq("user_id", uid);
  return uploaded;
}

// ---------- request handling ----------
async function userFromReq(req: Request) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await admin.auth.getUser(jwt);
  return data?.user ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "backup-all") {
      if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "unauthorized" }, 401);
      const { data: conns } = await admin.from("google_drive_connections").select("*");
      const results = [];
      for (const c of conns ?? []) {
        try { results.push({ user: c.google_email, files: await runBackup(c) }); }
        catch (e) {
          await admin.from("google_drive_connections").update({ last_backup_result: `FAILED: ${String(e).slice(0, 180)}` }).eq("user_id", c.user_id);
          results.push({ user: c.google_email, error: String(e) });
        }
      }
      return json({ results });
    }

    const user = await userFromReq(req);
    if (!user) return json({ error: "unauthorized" }, 401);

    if (action === "auth-url") {
      if (!CLIENT_ID) return json({ error: "GOOGLE_CLIENT_ID secret not set" }, 500);
      const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      u.searchParams.set("client_id", CLIENT_ID);
      u.searchParams.set("redirect_uri", body.redirect_uri);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("scope", "openid email https://www.googleapis.com/auth/drive.file");
      u.searchParams.set("access_type", "offline");
      u.searchParams.set("prompt", "consent");
      u.searchParams.set("state", body.state ?? "");
      return json({ url: u.toString() });
    }

    if (action === "exchange") {
      const tok = await tokenRequest({
        code: body.code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        redirect_uri: body.redirect_uri, grant_type: "authorization_code",
      });
      let email = null;
      try {
        const info = await gapi(tok.access_token, "https://www.googleapis.com/oauth2/v2/userinfo");
        email = info.email ?? null;
      } catch { /* email is cosmetic */ }
      const folderId = await ensureFolder(tok.access_token, "Fleet Records");
      if (!tok.refresh_token) {
        const { data: prev } = await admin.from("google_drive_connections").select("refresh_token").eq("user_id", user.id).single();
        if (!prev) return json({ error: "Google did not return a refresh token — disconnect the app at myaccount.google.com/permissions and try again" }, 400);
        tok.refresh_token = prev.refresh_token;
      }
      await admin.from("google_drive_connections").upsert({
        user_id: user.id, google_email: email, refresh_token: tok.refresh_token,
        folder_id: folderId, folder_name: "Fleet Records",
      });
      return json({ connected: true, email, folder_name: "Fleet Records" });
    }

    const { data: conn } = await admin.from("google_drive_connections").select("*").eq("user_id", user.id).single();

    if (action === "status") {
      if (!conn) return json({ connected: false });
      return json({
        connected: true, email: conn.google_email, folder_name: conn.folder_name,
        folder_id: conn.folder_id, last_backup_at: conn.last_backup_at, last_backup_result: conn.last_backup_result,
      });
    }
    if (!conn) return json({ error: "not connected" }, 400);

    if (action === "backup") {
      const files = await runBackup(conn);
      return json({ ok: true, files });
    }
    if (action === "disconnect") {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(conn.refresh_token)}`, { method: "POST" }).catch(() => {});
      await admin.from("google_drive_connections").delete().eq("user_id", user.id);
      return json({ disconnected: true });
    }
    return json({ error: `unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
