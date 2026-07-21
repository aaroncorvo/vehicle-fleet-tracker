// ocr-receipt: extracts structured data from an automotive receipt image/PDF.
// Deploy via Supabase dashboard (Edge Functions → Deploy new function) or
// `supabase functions deploy ocr-receipt`. Requires the ANTHROPIC_API_KEY
// secret (Edge Functions → Secrets). JWT verification stays ON (default) so
// only the signed-in owner can call it.
import Anthropic from "npm:@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SCHEMA = {
  type: "object",
  properties: {
    vendor: { type: ["string", "null"], description: "Business name, e.g. 'Discount Tire'" },
    location: { type: ["string", "null"], description: "Street address / city if shown" },
    receipt_date: { type: ["string", "null"], description: "Receipt date as YYYY-MM-DD" },
    total: { type: ["number", "null"], description: "Final total charged, after tax" },
    tax: { type: ["number", "null"] },
    odometer: { type: ["integer", "null"], description: "Vehicle mileage/odometer if printed" },
    vehicle_hint: { type: ["string", "null"], description: "Vehicle described on receipt, e.g. '2015 Lexus GX460' or plate" },
    service_type: {
      type: ["string", "null"],
      description:
        "Best-fit category: Oil Change, Tire Rotation, Tires, Engine Air Filter, Cabin Air Filter, Brake Pads - Front, Brake Pads - Rear, Brake Fluid Flush, Transmission Fluid, Differential Fluid, Transfer Case Fluid, Coolant, Spark Plugs, Battery, Alignment, Inspection, Repair, Parts, Other",
    },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          part_number: { type: ["string", "null"], description: "Part/article number if shown" },
          quantity: { type: ["number", "null"] },
          amount: { type: ["number", "null"], description: "Extended line total" },
        },
        required: ["description", "part_number", "quantity", "amount"],
        additionalProperties: false,
      },
    },
    payment_method: { type: ["string", "null"], description: "e.g. 'AMX 2000', 'MasterCard'" },
    notes: { type: ["string", "null"], description: "Warranty terms, comments, install notes worth keeping" },
  },
  required: [
    "vendor", "location", "receipt_date", "total", "tax", "odometer",
    "vehicle_hint", "service_type", "line_items", "payment_method", "notes",
  ],
  additionalProperties: false,
};

const PROMPT = `Extract the data from this automotive receipt/invoice.
- receipt_date: the transaction date in YYYY-MM-DD (2-digit years are 20xx).
- odometer: the vehicle mileage if printed anywhere (often labeled MILEAGE or ODO).
- line_items: one entry per purchased item/fee, with part/article numbers when shown.
- notes: preserve technically useful details verbatim-ish (torque specs, warranty
  mileage, install comments) — this is for a meticulous vehicle maintenance log.
- Use null for anything not present. Do not guess values that are not on the receipt.`;

// ---- document mode (glovebox: insurance cards, registration, roadside) ----
const DOC_SCHEMA = {
  type: "object",
  properties: {
    doc_type: {
      type: ["string", "null"],
      description: "Best-fit category: Insurance Card, Registration, Roadside / AAA, Warranty, Inspection, Membership, Other",
    },
    holder_name: { type: ["string", "null"], description: "Named insured / owner / member — first name is enough if that's all that fits" },
    issuer: { type: ["string", "null"], description: "Company or agency, e.g. 'State Farm', 'Texas DMV', 'AAA Texas'" },
    policy_or_id: { type: ["string", "null"], description: "Policy number, member number, or document ID" },
    effective_date: { type: ["string", "null"], description: "Effective/issue date as YYYY-MM-DD" },
    expiration_date: { type: ["string", "null"], description: "Expiration date as YYYY-MM-DD (2-digit years are 20xx)" },
    vehicle_hint: { type: ["string", "null"], description: "Vehicle on the document: year/make/model, VIN, or plate" },
    phone: { type: ["string", "null"], description: "Claims / roadside / contact phone number if shown" },
    notes: { type: ["string", "null"], description: "Other useful details: coverage limits, agent name, NAIC number" },
  },
  required: ["doc_type", "holder_name", "issuer", "policy_or_id", "effective_date", "expiration_date", "vehicle_hint", "phone", "notes"],
  additionalProperties: false,
};

const DOC_PROMPT = `Extract the data from this vehicle-related document (insurance card,
registration, roadside/membership card, warranty, or inspection slip).
- Dates in YYYY-MM-DD; 2-digit years are 20xx.
- Use null for anything not present. Do not guess values that are not on the document.`;

// ---- parts mode (standard service parts for a known vehicle) ----
const PARTS_SCHEMA = {
  type: "object",
  properties: {
    parts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "What it is: 'Engine Oil', 'Oil Filter', 'Drain Plug Gasket'" },
          spec: { type: ["string", "null"], description: "Factory spec: viscosity/grade/type, e.g. '0W-20 Full Synthetic (API SN+)'" },
          qty: { type: ["string", "null"], description: "Quantity with unit, e.g. '8.0 qt with filter', '1'" },
          part_number: { type: ["string", "null"], description: "OEM part number ONLY if highly confident it fits this exact vehicle; else null" },
          uncertain: { type: "boolean", description: "true if the part number or spec should be verified before ordering" },
        },
        required: ["name", "spec", "qty", "part_number", "uncertain"],
        additionalProperties: false,
      },
    },
    notes: { type: ["string", "null"], description: "Fitment caveats worth showing the user (trim/engine variations, verify-before-order warnings)" },
  },
  required: ["parts", "notes"],
  additionalProperties: false,
};

const partsPrompt = (vehicle: string, service: string) =>
  `List the factory-standard parts and fluids needed to perform this service on this exact vehicle, for an owner doing the work themselves.

Vehicle: ${vehicle}
Service: ${service}

- Include everything consumed by the job (fluid with capacity, filter, gaskets/crush washers, plugs, etc.).
- spec = the factory requirement (viscosity, fluid type, grade) — not a brand.
- part_number = OEM (Toyota/Lexus etc.) part number, but ONLY when you are highly
  confident it fits this exact year/engine; otherwise null and set uncertain=true.
- Owners will swap in preferred brands afterward; your job is the correct baseline spec.
- If the service name doesn't consume parts (e.g. 'Tire Rotation'), return what's
  typically checked/replaced with it or an empty list.`;

// Entitlement gate: OCR (and parts lookup) are paid-plan features once billing
// launches. Fails OPEN if migration 0012 isn't applied or anything errors, so
// the feature never breaks ahead of the billing rollout.
async function ocrAllowed(req: Request): Promise<boolean> {
  try {
    const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!jwt || !url || !key) return true;
    const uRes = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, authorization: `Bearer ${jwt}` },
    });
    if (!uRes.ok) return true;
    const user = await uRes.json();
    const rpc = await fetch(`${url}/rest/v1/rpc/user_has_feature`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ uid: user.id, user_email: user.email, feat: "ocr" }),
    });
    if (!rpc.ok) return true; // 0012 not applied yet
    return (await rpc.json()) === true;
  } catch {
    return true;
  }
}

// ---- dtc mode (diagnose check-engine codes for a known vehicle) ----
const DTC_SCHEMA = {
  type: "object",
  properties: {
    codes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          meaning: { type: "string", description: "What this code means on THIS engine, one plain sentence" },
          severity: { type: "string", enum: ["info", "moderate", "serious", "stop-driving"] },
          likely_causes: { type: "array", items: { type: "string" }, description: "Ordered most→least likely for this exact engine" },
          diy: { type: "string", description: "Realistic DIY path: what to check/replace first, rough difficulty" },
          urgency: { type: "string", description: "Can it be driven? For how long? What gets damaged if ignored?" },
        },
        required: ["code", "meaning", "severity", "likely_causes", "diy", "urgency"],
        additionalProperties: false,
      },
    },
    summary: { type: ["string", "null"], description: "If codes are related, the one-paragraph unified diagnosis; else null" },
  },
  required: ["codes", "summary"],
  additionalProperties: false,
};

const dtcPrompt = (vehicle: string, codes: string[]) =>
  `Diagnose these OBD-II trouble codes for this exact vehicle, for a technically fluent owner who does his own work.

Vehicle: ${vehicle}
Codes: ${codes.join(", ")}

- meaning/likely_causes must be specific to this engine where the code has a known
  pattern on it (e.g. known failure modes on this platform), generic SAE otherwise.
- severity: 'stop-driving' only for genuine damage risk (flashing-CEL-grade misfire,
  oil pressure, overheating). Be honest, not alarmist.
- If multiple codes share one root cause, explain that in summary and keep the
  per-code entries short.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    const { media_type, data, mode } = body;

    if (!(await ocrAllowed(req))) {
      return new Response(
        JSON.stringify({ error: "Scanning requires a paid plan — upgrade in Settings." }),
        { status: 402, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    if (mode === "dtc") {
      const { vehicle, codes } = body;
      if (!vehicle || !Array.isArray(codes) || codes.length === 0) throw new Error("vehicle and codes[] required");
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 3072,
        output_config: { format: { type: "json_schema", schema: DTC_SCHEMA } },
        messages: [{ role: "user", content: dtcPrompt(String(vehicle), codes.map(String)) }],
      });
      if (msg.stop_reason === "refusal") throw new Error("Diagnosis refused");
      const text = msg.content.find((b) => b.type === "text")?.text ?? "{}";
      return new Response(text, { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    if (mode === "parts") {
      const { vehicle, service } = body;
      if (!vehicle || !service) throw new Error("vehicle and service required");
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 2048,
        output_config: { format: { type: "json_schema", schema: PARTS_SCHEMA } },
        messages: [{ role: "user", content: partsPrompt(String(vehicle), String(service)) }],
      });
      if (msg.stop_reason === "refusal") throw new Error("Lookup refused");
      const text = msg.content.find((b) => b.type === "text")?.text ?? "{}";
      return new Response(text, { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    if (!media_type || !data) throw new Error("media_type and data (base64) required");
    const isDoc = mode === "document";

    const fileBlock = media_type === "application/pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
      : { type: "image" as const, source: { type: "base64" as const, media_type, data } };

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      output_config: { format: { type: "json_schema", schema: isDoc ? DOC_SCHEMA : SCHEMA } },
      messages: [{ role: "user", content: [fileBlock, { type: "text", text: isDoc ? DOC_PROMPT : PROMPT }] }],
    });

    if (msg.stop_reason === "refusal") throw new Error("Extraction refused");
    const text = msg.content.find((b) => b.type === "text")?.text ?? "{}";
    return new Response(text, {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
