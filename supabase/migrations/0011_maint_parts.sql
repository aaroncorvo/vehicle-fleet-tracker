-- 0011: structured parts list on maintenance items.
-- Each entry: { "name": "Engine Oil", "spec": "0W-20 Full Synthetic",
--               "qty": "7.9 qt", "part_number": "00279-0WQTE-01" }
-- so an upcoming service carries everything needed to DIY the job.
alter table maintenance_items
  add column if not exists parts jsonb not null default '[]'::jsonb;
