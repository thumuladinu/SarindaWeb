-- Cash Floats: Allow Multiple Records Per User Per Day
-- Run this to remove the unique constraint that prevents multiple entries

ALTER TABLE cash_floats DROP INDEX unique_user_date;

-- Verify the constraint is removed
SHOW INDEX FROM cash_floats;