# MotorLog Telematics Device — Buy vs. Build Research Report

Researched July 2026 for the 4-vehicle fleet (2015 GX460, 2017 IS350, 2004 GX470, 1991 FJ80), Supabase backend, complementing the phone-paired BLE OBD dongle path.

---

## 1. Verdict: Buy first, build only if you outgrow it

**Named starting device: Freematics ONE+ Model B — US$135, in stock** (freematics.com). It is almost literally the device you were about to design: an OBD-plug dongle containing an ESP32 (16MB flash / 8MB PSRAM), an **integrated SIM7670G LTE Cat-1 modem**, a **u-blox M9 GNSS** module + antenna, an ICM-42627 motion sensor, and a microSD slot — with open Arduino-compatible firmware (`telelogger`) that already does the OBD polling loop, GNSS parsing, store-and-forward buffering, and cellular/WiFi upload (github.com/stanleyhuangyc/Freematics).

**Is Freematics alive in 2026? Yes, barely but sufficiently.** Commits as recent as Dec 2025; store taking orders; one-man project — treat as "buy the hardware, own the firmware fork." The firmware is plain Arduino/ESP-IDF source you fully control, so abandonment risk is acceptable.

**Runner-up / companion: WiCAN Pro (MeatPi) — $80** (Crowd Supply / Mouser, next batch ~Aug 2026). ESP32-S3 + a **dedicated OBD interpreter chip covering every legislated protocol — CAN, ISO 9141-2, KWP2000, J1850, J1939**. The only off-the-shelf open device that natively speaks the 2004 GX470's K-line. Limitations: no GPS or cellular on board (LTE/GPS add-on announced, not shipping); WiFi/BLE/MQTT-first.

**OVMS v3.3** (~$290, SIM7600 + 3×CAN) is mature but EV-centric and overkill for ICE PID logging. Good firmware to *read* for architecture ideas.

**Cost/effort comparison (per vehicle):**

| Path | Hardware $ | Firmware effort | GX470 K-line? | GPS+LTE built in? |
|---|---|---|---|---|
| Freematics ONE+ Model B | $135 | Low — fork telelogger, change endpoint | No | **Yes** |
| WiCAN Pro | $80 | Low-mid — no GPS story yet | **Yes** | No |
| OVMS v3.3 | ~$290 | Mid | Partially | Yes |
| From-scratch custom | $90–150 parts | **High — 40–100+ hrs** | Yes (add L9637D) | You integrate it |

From-scratch saves at best ~$50/device and costs weeks of firmware debugging. **Build only in Phase 4, and only if you enjoy it.**

---

## 2. Per-vehicle protocol reality check

| Vehicle | Diagnostic reality | Device play |
|---|---|---|
| **2015 GX460** | ISO 15765-4 CAN 500k/11-bit | Any device. Freematics Model B ideal. |
| **2017 IS350** | ISO 15765-4 CAN | Any device. Natural BLE-dongle car. |
| **2004 GX470** | **ISO 9141-2 / KWP2000 K-line** (2004–05 was Toyota's transition window). **Verify in 5 min:** resistance pin 6↔14 on the DLC — ~60 Ω = CAN; open + pin 7 present = ISO 9141 | **WiCAN Pro** (native K-line) or custom board with **E-L9637D** transceiver (~$1.50, DigiKey; plain L9637D is obsolete). Freematics won't reliably do K-line. K-line is slow (~5 PIDs/sec) — poll a small set. |
| **1991 FJ80** | **No OBD-II.** OBD-I blink codes via TE1–E1 jumper in the engine-bay DIAGNOSIS connector — not worth interfacing | **GPS-only tracker**: ESP32+GPS+cellular from a fused 12V tap; engine-on via battery-voltage sensing (>13.2V = alternator). Gives trips, GPS-integrated mileage, location. Most justifies the dev-board path. |

---

## 3. From-scratch BOM (custom path, 2026 prices, per device)

| Item | Part | ~Price | Notes |
|---|---|---|---|
| MCU | ESP32-S3-WROOM-1-N16R8 devkit | $8–15 | S3: 1×TWAI (CAN), USB-OTG, big PSRAM. C6 has 2×TWAI but less RAM/ecosystem. |
| CAN transceiver | SN65HVD230 breakout | $2–5 | 3.3V-native. Do NOT add a 120Ω terminator on the OBD tap. |
| K-line (GX470) | E-L9637D + 510Ω pull-up to 12V | $3 | ESP32 K-line ref: github.com/muki01/OBD2_K-line_Reader |
| GNSS | u-blox NEO-M9N breakout ($50–70) or budget M10 module ($15–25) | $15–70 | A $20 M10 is honestly sufficient. Active patch antenna, remote-mounted. |
| Cellular | **SIM7080G** Cat-M1/NB-IoT ($25–45) or SIM7600G-H ($40–60) | $25–60 | Cat-M1 is right for telemetry: cheap, low-power, Verizon/AT&T LTE-M. |
| Power | Automotive 12V→5V buck (load-dump tolerant) + 3.3V LDO | $6–12 | Buck Iq <100µA — it dominates sleep draw. |
| Protection | SMBJ33A TVS, 2A fuse, reverse-Schottky | $3 | OBD pin 16 is battery-direct; load dump spikes >40V. |
| Connector | OBD-II male J1962 pigtail | $6–10 | |
| Storage | On-module flash + LittleFS (skip microSD) | $0 | microSD is the classic dashboard heat-death failure. |
| Enclosure | Vented ABS/PC (not PLA — slumps at 60°C) | $5–10 | |
| **Total** | | **≈$90–150** | vs. $135 Freematics buy-price. QED. |

**Dev-board shortcut: LILYGO T-SIM7080G-S3** — ESP32-S3 + SIM7080G Cat-M + **GPS** + PMU, **$29.60** (lilygo.cc; ~$45–55 Amazon). One board = MCU+cellular+GPS; add a $3 CAN transceiver (or nothing for the FJ80) and a buck. **Ideal FJ80 base.** T-Call is 2G-era — skip.

**Power budget:** OBD pin 16 always-hot. Target **<3mA average sleeping** (S3 deep sleep ~10–20µA, SIM7080G PSM single-digit µA, GPS backup ~15µA). Wake on voltage rise or accelerometer. **Stop transmitting <12.0V; deep-sleep <11.8V resting** — never strand a car. Watchdog everything.

**Thermal (Texas):** under-dash runs ~50–65°C (dash-top hits 85–105°C). **No LiPo in the device** (use a supercap for graceful shutdown). ESP32-WROOM rated −40/+85°C; SIM70xx to +85°C. GPS antenna: no fix from under the dash — run the patch antenna to the dash top / A-pillar trim; these Toyota windshields generally aren't metallized.

---

## 4. Firmware architecture

**ESP-IDF with Arduino-as-component (PlatformIO), not ESPHome** (no OBD/K-line/store-and-forward story). Freematics telelogger is the working reference. FreeRTOS tasks:

```
obd_task    — poll PIDs (speed, RPM, coolant, fuel, MAF) @1Hz; DTC scan at ignition-on; VIN once
gnss_task   — UBX-NAV-PVT @1–5Hz (skip NMEA parsing on u-blox)
buffer_task — CBOR records → LittleFS ring (survives dead zones/power loss)
uplink_task — every 30–60s moving: batch → gzip → HTTPS POST to edge fn; delete on 200
power_task  — voltage monitor, engine-on detect, deep-sleep state machine
ota_task    — daily manifest check in Supabase Storage; esp_https_ota + A/B rollback
```

OTA at n=4 is trivial: signed .bin + manifest.json in a Storage bucket.

---

## 5. Supabase ingestion architecture

**Transport: HTTPS POST to an Edge Function. Skip MQTT** (Supabase has no broker; EMQX serverless free tier would fit 4 devices but adds a vendor + webhook hop for nothing). 4 cars ≈ 10–15K invocations/month — 2–3% of the free tier.

**Device auth:** per-device random API key (NVS at provisioning, hashed in `devices`), `x-device-key` header. Telemetry written only by the function's service role; family reads via authenticated views.

```sql
create table devices (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references vehicles(id),
  name text, api_key_hash text not null,
  fw_version text, last_seen_at timestamptz
);

create table telemetry (
  id bigint generated always as identity primary key,
  device_id uuid references devices(id) not null,
  ts timestamptz not null,
  lat double precision, lon double precision,
  speed_kph real, heading real, hdop real,
  rpm int, coolant_c smallint, fuel_pct real,
  batt_v real, engine_on bool,
  pids jsonb, trip_id bigint
);
create index on telemetry (device_id, ts desc);

create table dtc_events (
  id bigint generated always as identity primary key,
  device_id uuid references devices(id), ts timestamptz,
  code text, status text
);

create table trips (
  id bigint generated always as identity primary key,
  vehicle_id uuid, started_at timestamptz, ended_at timestamptz,
  start_lat double precision, start_lon double precision,
  end_lat double precision, end_lon double precision,
  distance_km real, max_speed_kph real, fuel_used_est real
);
```

**pg_cron rollups:** every 5 min `detect_trips()` (segment by engine_on transitions / >5-min gaps, haversine distance); nightly `sync_odometer()` into the existing fuel/odometer model (anchored to real odometer entries at fill-ups so GPS drift doesn't accumulate). **Live map:** Realtime subscription on telemetry inserts (free tier plenty).

---

## 6. Costs, privacy, practicalities

**Cellular (4 vehicles):**
- **Hologram PAYG:** $0.03/MB → **$2.40–6/mo fleet** at 20–50MB/car/mo.
- **1NCE:** **$14 one-time per SIM for 10 years / 500MB** — perfect with WiFi-offload-at-home; $56 one-time covers the fleet for a decade.
- **Recommended:** 1NCE + WiFi offload. Realistic running cost **~$0–6/month**.

**Privacy (TX):** Penal Code §16.06 criminalizes trackers on vehicles *owned by another person* — owner-installed devices on your own fleet are outside it. Family-trust practice: everyone knows the device exists, sees their own vehicle's map, bounded retention (raw positions 90 days, trips forever), no covert mode. Write it down once; revisit for teen drivers.

---

## 7. Phased plan with budgets

| Phase | What | Budget | Exit criteria |
|---|---|---|---|
| **1. Validate pipeline (now)** | 1× Freematics ONE+ Model B ($135) + 1NCE SIM ($15) in the GX460. Fork telelogger → `ingest-telemetry` edge fn; telemetry/trips tables + live map. | **~$150** | 2 weeks of trips flowing; trip detection matches reality; odometer sync within 2%. |
| **2. K-line + bench tool** | 1× WiCAN Pro ($80) for the GX470 (after the 60Ω pin check). Doubles as a CAN/K-line bench analyzer. | **~$95** | GX470 PIDs landing in the same tables. |
| **3. FJ80 GPS-only** | LILYGO T-SIM7080G-S3 ($30–50) + buck/protection ($15) + antenna/enclosure ($15), fused 12V tap. Phase-1 firmware minus OBD; voltage engine-detect. | **~$80** | FJ80 trips tracked; no battery drain after 2-week parking test. |
| **4. (Optional) custom PCB** | S3 + SIM7080G + M10 + SN65HVD230 + E-L9637D on one board, 4 units — only if you want one unified SKU. | ~$400–500 + weekends | Parity with Phases 1–3. |
| **Total, Phases 1–3:** | | **~$325 hardware + ≤$6/mo** | IS350 stays on the BLE-dongle path (or add a second Model B). |

**Bottom line:** don't design hardware yet. $135 of Freematics validates the entire Supabase ingestion stack in a weekend; $80 of WiCAN Pro solves the one hard protocol problem (GX470 K-line); $80 of LILYGO solves the FJ80, which never needed OBD anyway. The custom PCB is a Phase-4 luxury.

Key sources: freematics.com (ONE+ Model B, $135) · github.com/stanleyhuangyc/Freematics · crowdsupply.com/meatpi-electronics/wican-pro · meatpi.com/products/wican-pro · github.com/meatpiHQ/wican-fw · github.com/openvehicles/Open-Vehicle-Monitoring-System-3 · lilygo.cc/products/t-sim7080-s3 · digikey.com E-L9637D · github.com/muki01/OBD2_K-line_Reader · pinoutguide.com Toyota/Lexus DLC · troublecodes.net Toyota 88–94 Land Cruiser · hologram.io/pricing · 1nce.com ($14/10yr) · emqx.com serverless · supabase.com/pricing · supabase.com/docs/guides/cron
