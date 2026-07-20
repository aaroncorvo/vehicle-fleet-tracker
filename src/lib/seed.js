// Starter data: loaded once via the "Load my fleet" button when the account is empty.
// Vehicles are matched to inserted UUIDs at load time via the `key` field.

export const seedVehicles = [
  { key: 'gx460', name: 'GX460', nickname: null, year: 2015, make: 'Lexus', model: 'GX 460', vin: 'JTJBM7FX6F5091083', engine: '1UR-FE 4.6L V8', base_odometer: 90191, fuel_octane: '93 Premium', sort_order: 1 },
  { key: 'is350', name: 'IS350', nickname: 'F-Sport', year: 2017, make: 'Lexus', model: 'IS 350', vin: 'JTHBE1D23H5030666', engine: '2GR-FSE 3.5L V6', base_odometer: 0, fuel_octane: '93 Premium', sort_order: 2 },
  { key: 'gx470', name: 'GX470', nickname: null, year: 2004, make: 'Lexus', model: 'GX 470', vin: 'JTJBT20XX40058872', engine: '2UZ-FE 4.7L V8', base_odometer: 275000, fuel_octane: '87 Regular', sort_order: 3 },
  { key: 'fj80', name: 'Land Cruiser', nickname: 'Ghost', year: 1991, make: 'Toyota', model: 'Land Cruiser FJ80', vin: 'JT3FJ80WXM0034788', engine: '3F-E 4.0L I6', base_odometer: 286589, fuel_octane: '87 Regular', sort_order: 4 },
]

export const seedFuel = [
  { key: 'gx460', filled_at: '2026-06-26', fill_time: '1:00 PM', odometer: 90191, fill_type: 'reset', gallons: 17.323, cost_per_gallon: 3.78, total_cost: 65.46, octane: '93 Premium', brand: 'QuikTrip', location: 'QuikTrip', payment: 'MasterCard', notes: 'Reset baseline' },
  { key: 'gx460', filled_at: '2026-06-27', fill_time: '4:51 PM', odometer: 90449, fill_type: 'full', gallons: 18.679, cost_per_gallon: 3.70, total_cost: 69.09, octane: '93 Premium', brand: null, location: 'Southwest Travel Center', payment: 'MasterCard', notes: null },
  { key: 'gx460', filled_at: '2026-07-04', fill_time: '7:40 AM', odometer: 90684, fill_type: 'full', gallons: 18.128, cost_per_gallon: 4.31, total_cost: 78.11, octane: '93 Premium', brand: 'Shell', location: 'Shell', payment: 'MasterCard', notes: null },
  { key: 'gx460', filled_at: '2026-07-04', fill_time: '9:19 AM', odometer: 90796, fill_type: 'full', gallons: 8.891, cost_per_gallon: 5.00, total_cost: 44.45, octane: '93 Premium', brand: 'Shell', location: 'Shell', payment: 'MasterCard', notes: 'Same-day second fill' },
  { key: 'gx460', filled_at: '2026-07-06', fill_time: '11:45 AM', odometer: 91076, fill_type: 'full', gallons: 18.596, cost_per_gallon: 4.35, total_cost: 80.87, octane: '93 Premium', brand: 'Texaco', location: 'Texaco', payment: 'MasterCard', notes: null },
  { key: 'gx460', filled_at: '2026-07-17', fill_time: '1:41 PM', odometer: 91252, fill_type: 'full', gallons: 14.057, cost_per_gallon: 4.20, total_cost: 59.03, octane: '93 Premium', brand: 'QuikTrip', location: 'QuikTrip', payment: 'MasterCard', notes: null },
  { key: 'fj80', filled_at: '2026-04-17', fill_time: '6:32 PM', odometer: 286589, fill_type: 'reset', gallons: 19.320, cost_per_gallon: 3.58, total_cost: 69.15, octane: '87 Regular', brand: null, location: null, payment: null, notes: 'First logged fill — baseline' },
]

// Maintenance intervals per vehicle. last_done left null where unknown → shows "set baseline".
export const seedMaintenance = [
  // GX460 (1UR-FE) — includes KDSS
  { key: 'gx460', name: 'Engine Oil & Filter', interval_miles: 7500, interval_months: 6, part_number: '04152-YZZA5', notes: 'Mobil 1 0W-20, 8.2 qt. 64mm cap wrench, 18 ft-lb. Drain 30 ft-lb.' },
  { key: 'gx460', name: 'Engine Air Filter', interval_miles: 30000, interval_months: null, part_number: '17801-38051', notes: null },
  { key: 'gx460', name: 'Cabin Air Filter', interval_miles: 20000, interval_months: 12, part_number: '87139-50100', notes: null },
  { key: 'gx460', name: 'Transmission Fluid (drain/fill)', interval_miles: 60000, interval_months: null, last_done_miles: null, notes: 'WS fluid. DUE at 90k baseline — no service history.' },
  { key: 'gx460', name: 'Front Differential Fluid', interval_miles: 30000, interval_months: null, notes: '75W-85 GL-5' },
  { key: 'gx460', name: 'Rear Differential Fluid', interval_miles: 30000, interval_months: null, notes: '75W-85 GL-5' },
  { key: 'gx460', name: 'Transfer Case Fluid', interval_miles: 60000, interval_months: null, notes: '75W gear oil' },
  { key: 'gx460', name: 'Brake Fluid Flush', interval_miles: null, interval_months: 36, notes: 'DOT 3' },
  { key: 'gx460', name: 'KDSS Fluid Inspect', interval_miles: null, interval_months: 24, notes: 'SUSPENSION FLUID AHC. Most shops miss this. Inspect before lift install.' },
  { key: 'gx460', name: 'Coolant (SLLC)', interval_miles: 100000, interval_months: 120, notes: 'Super Long Life pink. First at 100k, then 50k.' },
  { key: 'gx460', name: 'Spark Plugs', interval_miles: 120000, interval_months: null, notes: 'Iridium' },
  { key: 'gx460', name: 'Tire Rotation', interval_miles: 5000, interval_months: null, notes: 'Method MR305 NV 17" — torque 24x lug nuts after 50 mi' },
  // IS350 (2GR-FSE)
  { key: 'is350', name: 'Engine Oil & Filter', interval_miles: 7500, interval_months: 6, part_number: '04152-31090', notes: 'Mobil 1 0W-20, 6.6-6.8 qt. 65mm cap wrench.' },
  { key: 'is350', name: 'Engine Air Filter', interval_miles: 30000, interval_months: null, part_number: '17801-31170', notes: null },
  { key: 'is350', name: 'Cabin Air Filter', interval_miles: 20000, interval_months: 12, part_number: '87139-50100', notes: null },
  { key: 'is350', name: 'Brake Fluid Flush', interval_miles: null, interval_months: 36, notes: 'DOT 3' },
  { key: 'is350', name: 'Tire Rotation', interval_miles: 5000, interval_months: null, notes: 'F-Sport staggered? Check sizes before rotating.' },
  // GX470 (2UZ-FE)
  { key: 'gx470', name: 'Engine Oil & Filter', interval_miles: 5000, interval_months: 6, part_number: '90915-YZZD3', notes: 'Mobil 1 HM 5W-30, 6.5 qt. OEM FILTER ONLY — no WIX 51515. Check level weekly.' },
  { key: 'gx470', name: 'Engine Air Filter', interval_miles: 30000, interval_months: null, part_number: '17801-50040', notes: null },
  { key: 'gx470', name: 'Cabin Air Filter', interval_miles: 20000, interval_months: 12, part_number: '87139-48020-83', notes: null },
  { key: 'gx470', name: 'Timing Belt & Water Pump', interval_miles: 90000, interval_months: 84, last_done_miles: 275000, notes: 'Done at ~275k. Next ~365k or 7 yrs.' },
  { key: 'gx470', name: 'Transmission Fluid (drain/fill)', interval_miles: 60000, interval_months: null, notes: 'A750F, WS fluid' },
  { key: 'gx470', name: 'Diff / Transfer Case Fluids', interval_miles: 30000, interval_months: null, notes: null },
  // FJ80 (3F-E)
  { key: 'fj80', name: 'Engine Oil & Filter', interval_miles: 4000, interval_months: 6, part_number: '90915-YZZD3', notes: 'Conventional 15W-40 (ZDDP for flat-tappet cam), 7-8.2 qt.' },
  { key: 'fj80', name: 'Air Filter (wash)', interval_miles: 15000, interval_months: null, part_number: '17801-68020', notes: 'WASHABLE canister — wash, dry fully, reinstall.' },
  { key: 'fj80', name: 'Brake Bleed Follow-up', interval_miles: null, interval_months: 1, notes: 'Minor air bubbles remained after last bleed — re-bleed.' },
  { key: 'fj80', name: 'Wiper Linkage Lube / Motor Ground', interval_miles: null, interval_months: 1, notes: 'Slow wipers — lube linkage, check motor ground.' },
  { key: 'fj80', name: 'Diff / Transfer / Trans Fluids', interval_miles: 30000, interval_months: 24, notes: 'A442F trans. Monitor — A750F swap candidate if it fails.' },
]

export async function loadSeed(supabase) {
  const { data: vrows, error: verr } = await supabase
    .from('vehicles')
    .insert(seedVehicles.map(({ key, ...v }) => v))
    .select()
  if (verr) throw verr
  // map key -> id by matching order (insert preserves order) 
  const idByKey = {}
  seedVehicles.forEach((sv, i) => { idByKey[sv.key] = vrows[i].id })

  const { error: ferr } = await supabase.from('fuel_logs').insert(
    seedFuel.map(({ key, ...f }) => ({ ...f, vehicle_id: idByKey[key] }))
  )
  if (ferr) throw ferr

  const { error: merr } = await supabase.from('maintenance_items').insert(
    seedMaintenance.map(({ key, ...m }) => ({ ...m, vehicle_id: idByKey[key] }))
  )
  if (merr) throw merr
}
