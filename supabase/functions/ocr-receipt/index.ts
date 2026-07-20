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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { media_type, data } = await req.json();
    if (!media_type || !data) throw new Error("media_type and data (base64) required");

    const fileBlock = media_type === "application/pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
      : { type: "image" as const, source: { type: "base64" as const, media_type, data } };

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: [fileBlock, { type: "text", text: PROMPT }] }],
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
