-- Stock Return Feature - Database Migration
-- Adds columns to link return operations to original sales operations

-- Add REFERENCE_OP_ID to link return (Op 11) to original sale (Op 3 or 4)
ALTER TABLE store_stock_operations
ADD COLUMN REFERENCE_OP_ID INT NULL AFTER TRANSFER_ID;

-- Add RETURN_TYPE to categorize return type
ALTER TABLE store_stock_operations
ADD COLUMN RETURN_TYPE VARCHAR(20) NULL AFTER REFERENCE_OP_ID;

-- Add index for faster lookups
ALTER TABLE store_stock_operations
ADD INDEX idx_reference_op (REFERENCE_OP_ID);