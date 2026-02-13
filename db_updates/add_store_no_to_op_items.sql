-- Add STORE_NO column to store_stock_operation_items
-- This allows tracking which store each operation item affects
-- Useful for transfer operations that affect both Store 1 and Store 2

ALTER TABLE store_stock_operation_items
ADD COLUMN IF NOT EXISTS STORE_NO INT DEFAULT 1 AFTER IS_ACTIVE;

-- Update existing records to have STORE_NO = 1 (they were all for Store 1)
UPDATE store_stock_operation_items
SET
    STORE_NO = 1
WHERE
    STORE_NO IS NULL;