alter table app.batches add column target_input_kg numeric(15,3) not null default 0 check(target_input_kg>=0);
