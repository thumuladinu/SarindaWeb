-- Add SHOW_IN_WEIGHING column to store_items table
-- This controls whether an item is visible in the Store 2 Weighing App
-- Default 1 (ON) so all existing items remain visible

ALTER TABLE store_items
ADD COLUMN SHOW_IN_WEIGHING TINYINT(1) DEFAULT 1;

-- Verify the column was added
DESCRIBE store_items;