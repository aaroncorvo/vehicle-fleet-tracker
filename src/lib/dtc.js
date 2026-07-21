import { supabase } from './supabase.js'
import { vehicleDescriptor } from './parts.js'

// ===== DTC understanding =====
// Layer 1: instant local lookup — curated common codes + SAE range fallback.
// Layer 2: AI diagnosis for the exact engine via the ocr-receipt fn (mode 'dtc').

const DB = {
  // Fuel trim / air metering
  P0171: 'System too lean (Bank 1) — vacuum leak, dirty MAF, weak fuel pump',
  P0172: 'System too rich (Bank 1)',
  P0174: 'System too lean (Bank 2)',
  P0175: 'System too rich (Bank 2)',
  P0100: 'MAF sensor circuit malfunction',
  P0101: 'MAF sensor range/performance',
  P0102: 'MAF sensor low input',
  P0103: 'MAF sensor high input',
  P0110: 'Intake air temp sensor circuit',
  P0113: 'Intake air temp sensor high input',
  P0115: 'Engine coolant temp sensor circuit',
  P0117: 'Coolant temp sensor low input',
  P0118: 'Coolant temp sensor high input',
  P0120: 'Throttle position sensor circuit',
  P0121: 'Throttle position sensor range/performance',
  P0125: 'Insufficient coolant temp for closed-loop fuel control',
  P0128: 'Coolant thermostat below regulating temperature (stuck-open thermostat)',
  // Ignition / misfire
  P0300: 'Random/multiple cylinder misfire detected',
  P0301: 'Cylinder 1 misfire detected',
  P0302: 'Cylinder 2 misfire detected',
  P0303: 'Cylinder 3 misfire detected',
  P0304: 'Cylinder 4 misfire detected',
  P0305: 'Cylinder 5 misfire detected',
  P0306: 'Cylinder 6 misfire detected',
  P0307: 'Cylinder 7 misfire detected',
  P0308: 'Cylinder 8 misfire detected',
  P0325: 'Knock sensor 1 circuit (Bank 1)',
  P0330: 'Knock sensor 2 circuit (Bank 2)',
  P0335: 'Crankshaft position sensor circuit',
  P0340: 'Camshaft position sensor circuit',
  // VVT (very Toyota/Lexus)
  P0011: 'Camshaft position timing over-advanced (Bank 1) — VVT-i; often oil flow/OCV',
  P0012: 'Camshaft position timing over-retarded (Bank 1)',
  P0021: 'Camshaft position timing over-advanced (Bank 2)',
  P0022: 'Camshaft position timing over-retarded (Bank 2)',
  P0016: 'Crank/cam position correlation (Bank 1 Sensor A)',
  // O2 / AFR sensors
  P0130: 'O2 sensor circuit (Bank 1, Sensor 1)',
  P0133: 'O2 sensor slow response (Bank 1, Sensor 1)',
  P0135: 'O2 sensor heater circuit (Bank 1, Sensor 1)',
  P0136: 'O2 sensor circuit (Bank 1, Sensor 2)',
  P0141: 'O2 sensor heater circuit (Bank 1, Sensor 2)',
  P0155: 'O2 sensor heater circuit (Bank 2, Sensor 1)',
  P0161: 'O2 sensor heater circuit (Bank 2, Sensor 2)',
  P1135: 'Air/fuel ratio sensor heater circuit (Bank 1 S1) — Toyota/Lexus',
  P1155: 'Air/fuel ratio sensor heater circuit (Bank 2 S1) — Toyota/Lexus',
  // Catalyst
  P0420: 'Catalyst efficiency below threshold (Bank 1)',
  P0430: 'Catalyst efficiency below threshold (Bank 2)',
  // EVAP
  P0440: 'EVAP system malfunction',
  P0441: 'EVAP incorrect purge flow',
  P0442: 'EVAP small leak detected',
  P0446: 'EVAP vent control circuit',
  P0455: 'EVAP large leak detected (check gas cap first)',
  P0456: 'EVAP very small leak detected',
  // EGR / emissions
  P0401: 'EGR insufficient flow',
  P0402: 'EGR excessive flow',
  // Idle / speed
  P0500: 'Vehicle speed sensor malfunction',
  P0505: 'Idle control system malfunction',
  P0504: 'Brake switch A/B correlation',
  // Power / ECU
  P0562: 'System voltage low (charging system / battery)',
  P0563: 'System voltage high',
  P0606: 'ECM/PCM processor fault',
  P0607: 'Control module performance',
  // Transmission
  P0700: 'Transmission control system malfunction (read TCM codes)',
  P0741: 'Torque converter clutch stuck off / performance',
  P0770: 'Shift solenoid E malfunction',
  P0773: 'Shift solenoid E electrical',
  // Network
  U0100: 'Lost communication with ECM/PCM',
  U0155: 'Lost communication with instrument cluster',
  // Toyota chassis
  C1201: 'Engine control system fault flagged to ABS/VSC (Toyota/Lexus — fix the P-code first)',
}

// SAE subsystem ranges → fallback description
const RANGES = [
  [/^P00/, 'Fuel & air metering / auxiliary emission controls'],
  [/^P01/, 'Fuel & air metering'],
  [/^P02/, 'Fuel injector circuit'],
  [/^P03/, 'Ignition system or misfire'],
  [/^P04/, 'Auxiliary emission controls (EVAP/EGR/catalyst)'],
  [/^P05/, 'Vehicle speed / idle control / auxiliary inputs'],
  [/^P06/, 'Computer output circuit'],
  [/^P0[789]/, 'Transmission'],
  [/^P1/, 'Manufacturer-specific powertrain code'],
  [/^P2/, 'Fuel & air metering / injector (SAE extended)'],
  [/^P3/, 'Ignition / cylinder deactivation (SAE extended)'],
  [/^C/, 'Chassis (ABS, steering, suspension)'],
  [/^B/, 'Body (airbags, lighting, comfort)'],
  [/^U/, 'Network / module communication'],
]

export function describeDtc(code) {
  const c = String(code).toUpperCase().trim()
  if (DB[c]) return DB[c]
  const r = RANGES.find(([re]) => re.test(c))
  return r ? r[1] : 'Unknown code'
}

// AI diagnosis for the exact vehicle — same edge function, mode 'dtc'
export async function explainDtcs(vehicle, codes) {
  const { data, error } = await supabase.functions.invoke('ocr-receipt', {
    body: { mode: 'dtc', vehicle: vehicleDescriptor(vehicle), codes },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}
