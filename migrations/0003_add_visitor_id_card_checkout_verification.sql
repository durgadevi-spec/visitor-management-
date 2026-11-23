ALTER TABLE visitors
  ADD COLUMN IF NOT EXISTS id_card_number text,
  ADD COLUMN IF NOT EXISTS id_card_returned boolean,
  ADD COLUMN IF NOT EXISTS checked_out_by integer;
