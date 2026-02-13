-- =====================================================
-- STOCK OPERATIONS FEATURE - DATABASE MIGRATION
-- Run this script to create all required tables
-- =====================================================

-- Master table for all stock operations (Operations 1-9)
CREATE TABLE IF NOT EXISTS store_stock_operations (
    OP_ID INT NOT NULL AUTO_INCREMENT,
    OP_CODE VARCHAR(50) NOT NULL,           -- Unique operation code (e.g., "OP-2026020309-001")
    OP_TYPE TINYINT NOT NULL,                -- 1-9 matching operation types
    STORE_NO INT NOT NULL,                   -- Auto: 1 or 2 based on source app
    CLEARANCE_TYPE VARCHAR(10),              -- Auto: 'FULL' or 'PARTIAL' (Op 9 derives from selection)

-- Sales Bill Fields (Operations 3, 4)
CUSTOMER_ID INT DEFAULT NULL,
CUSTOMER_NAME VARCHAR(100) DEFAULT NULL,
CUSTOMER_CONTACT VARCHAR(50) DEFAULT NULL,
BILL_CODE VARCHAR(50) DEFAULT NULL,
BILL_AMOUNT DECIMAL(12, 2) DEFAULT NULL,

-- Lorry Fields (Operations 7, 8)
LORRY_NAME VARCHAR(100) DEFAULT NULL,
DRIVER_NAME VARCHAR(100) DEFAULT NULL,
DESTINATION VARCHAR(200) DEFAULT NULL,
RETURN_STATUS VARCHAR(20) DEFAULT NULL, -- 'PENDING', 'PARTIAL_RETURN', 'FULLY_RETURNED'

-- Transfer Fields (Operations 5, 6)
TRANSFER_ID INT DEFAULT NULL, -- FK to store_stock_transfers

-- Wastage/Surplus tracking (for Operations 3, 6, 8, 9-full)
WASTAGE_AMOUNT DECIMAL(12, 2) DEFAULT 0,
SURPLUS_AMOUNT DECIMAL(12, 2) DEFAULT 0,

-- Common Fields
COMMENTS TEXT,
DATE VARCHAR(45), -- Operation date
CREATED_BY INT,
CREATED_BY_NAME VARCHAR(100),
CREATED_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
EDITED_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
IS_ACTIVE TINYINT(1) DEFAULT 1,

-- Sync tracking
LOCAL_ID VARCHAR(50) DEFAULT NULL,       -- Local ID for offline sync
    SYNCED TINYINT(1) DEFAULT 1,
    
    PRIMARY KEY (OP_ID),
    UNIQUE KEY idx_op_code (OP_CODE),
    KEY idx_op_type (OP_TYPE),
    KEY idx_store_no (STORE_NO),
    KEY idx_created_date (CREATED_DATE),
    KEY idx_clearance_type (CLEARANCE_TYPE)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Items involved in each operation (source items being cleared/transferred)
CREATE TABLE IF NOT EXISTS store_stock_operation_items (
    OP_ITEM_ID INT NOT NULL AUTO_INCREMENT,
    OP_ID INT NOT NULL,
    ITEM_ID INT NOT NULL,
    ITEM_CODE VARCHAR(50),
    ITEM_NAME VARCHAR(100),

-- Stock tracking
ORIGINAL_STOCK DECIMAL(12, 2) DEFAULT 0, -- Stock before operation
CLEARED_QUANTITY DECIMAL(12, 2) DEFAULT 0, -- Quantity being cleared/transferred
REMAINING_STOCK DECIMAL(12, 2) DEFAULT 0, -- Stock after operation (for partial ops)

-- Sales fields (Operations 3, 4)
SOLD_QUANTITY DECIMAL(12, 2) DEFAULT 0,
PRICE DECIMAL(10, 2) DEFAULT 0,
TOTAL DECIMAL(12, 2) DEFAULT 0,

-- Conversion flag
HAS_CONVERSION TINYINT(1) DEFAULT 0,      -- If this item is being converted
    
    IS_ACTIVE TINYINT(1) DEFAULT 1,
    CREATED_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (OP_ITEM_ID),
    KEY idx_op_id (OP_ID),
    KEY idx_item_id (ITEM_ID),
    CONSTRAINT fk_op_items_op FOREIGN KEY (OP_ID) REFERENCES store_stock_operations(OP_ID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Item conversions (when one item becomes multiple items)
CREATE TABLE IF NOT EXISTS store_stock_operation_conversions (
    CONV_ID INT NOT NULL AUTO_INCREMENT,
    OP_ID INT NOT NULL,

-- Source item
SOURCE_ITEM_ID INT NOT NULL,
SOURCE_ITEM_CODE VARCHAR(50),
SOURCE_ITEM_NAME VARCHAR(100),
SOURCE_QUANTITY DECIMAL(12, 2) DEFAULT 0, -- Quantity being converted

-- Destination item (what it's converted into)
DEST_ITEM_ID INT NOT NULL,
    DEST_ITEM_CODE VARCHAR(50),
    DEST_ITEM_NAME VARCHAR(100),
    DEST_QUANTITY DECIMAL(12,2) DEFAULT 0,    -- Quantity of destination item created
    
    IS_ACTIVE TINYINT(1) DEFAULT 1,
    CREATED_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (CONV_ID),
    KEY idx_conv_op_id (OP_ID),
    KEY idx_source_item (SOURCE_ITEM_ID),
    KEY idx_dest_item (DEST_ITEM_ID),
    CONSTRAINT fk_conv_op FOREIGN KEY (OP_ID) REFERENCES store_stock_operations(OP_ID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Store transfers (Operations 5, 6) - Two-step approval workflow
CREATE TABLE IF NOT EXISTS store_stock_transfers (
    TRANSFER_ID INT NOT NULL AUTO_INCREMENT,
    TRANSFER_CODE VARCHAR(50) NOT NULL,       -- Unique transfer code
    OP_ID INT DEFAULT NULL,                   -- Links back to the operation record

-- Store info
SOURCE_STORE INT DEFAULT 1, -- Always Store 1
DEST_STORE INT DEFAULT 2, -- Always Store 2
TRANSFER_TYPE VARCHAR(20), -- 'STANDARD' (Op 5) or 'FULL_CLEARANCE' (Op 6)

-- Quantities
ORIGINAL_QUANTITY DECIMAL(12, 2) DEFAULT 0, -- Total stock in source store
TRANSFERRED_QUANTITY DECIMAL(12, 2) DEFAULT 0, -- Weighed/verified quantity
WASTAGE_AMOUNT DECIMAL(12, 2) DEFAULT 0,
SURPLUS_AMOUNT DECIMAL(12, 2) DEFAULT 0,

-- Approval workflow
STATUS VARCHAR(20) DEFAULT 'PENDING',     -- 'PENDING', 'APPROVED', 'REJECTED'
    INITIATED_BY INT,
    INITIATED_BY_NAME VARCHAR(100),
    INITIATED_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    APPROVED_BY INT DEFAULT NULL,
    APPROVED_BY_NAME VARCHAR(100) DEFAULT NULL,
    APPROVED_DATE TIMESTAMP DEFAULT NULL,
    REJECT_REASON TEXT DEFAULT NULL,
    
    COMMENTS TEXT,
    IS_ACTIVE TINYINT(1) DEFAULT 1,
    CREATED_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    EDITED_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    PRIMARY KEY (TRANSFER_ID),
    UNIQUE KEY idx_transfer_code (TRANSFER_CODE),
    KEY idx_transfer_status (STATUS),
    KEY idx_transfer_op (OP_ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Transfer items (items being transferred)
CREATE TABLE IF NOT EXISTS store_stock_transfer_items (
    TRANSFER_ITEM_ID INT NOT NULL AUTO_INCREMENT,
    TRANSFER_ID INT NOT NULL,
    ITEM_ID INT NOT NULL,
    ITEM_CODE VARCHAR(50),
    ITEM_NAME VARCHAR(100),

-- Quantities
ORIGINAL_QUANTITY DECIMAL(12, 2) DEFAULT 0, -- Quantity in source store
WEIGHED_QUANTITY DECIMAL(12, 2) DEFAULT 0, -- Verified weighed quantity

-- Conversion tracking
HAS_CONVERSION TINYINT(1) DEFAULT 0,
    
    IS_ACTIVE TINYINT(1) DEFAULT 1,
    CREATED_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (TRANSFER_ITEM_ID),
    KEY idx_transfer_id (TRANSFER_ID),
    CONSTRAINT fk_transfer_items FOREIGN KEY (TRANSFER_ID) REFERENCES store_stock_transfers(TRANSFER_ID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Lorry returns (Operations 7, 8) - Return management
CREATE TABLE IF NOT EXISTS store_lorry_returns (
    RETURN_ID INT NOT NULL AUTO_INCREMENT,
    OP_ID INT NOT NULL,                       -- Links to original lorry clearance

-- Lorry info (copied for convenience)
LORRY_NAME VARCHAR(100),

-- Return details
RETURN_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

-- Quantities
ORIGINAL_CLEARED DECIMAL(12, 2) DEFAULT 0, -- What was originally cleared
RETURN_QUANTITY DECIMAL(12, 2) DEFAULT 0, -- What's being returned
WASTAGE_FROM_RETURN DECIMAL(12, 2) DEFAULT 0,
NET_DELIVERED DECIMAL(12, 2) DEFAULT 0, -- Calculated: Original - Returns - Wastage

-- Notes and proof
NOTES TEXT,
PHOTO_URL VARCHAR(500) DEFAULT NULL, -- Optional proof photo

-- Conversion on returns
HAS_CONVERSION TINYINT(1) DEFAULT 0,
    
    CREATED_BY INT,
    CREATED_BY_NAME VARCHAR(100),
    CREATED_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    IS_ACTIVE TINYINT(1) DEFAULT 1,
    
    PRIMARY KEY (RETURN_ID),
    KEY idx_return_op (OP_ID),
    CONSTRAINT fk_return_op FOREIGN KEY (OP_ID) REFERENCES store_stock_operations(OP_ID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Return items (items being returned with quantities)

CREATE TABLE IF NOT EXISTS store_lorry_return_items (
    RETURN_ITEM_ID INT NOT NULL AUTO_INCREMENT,
    RETURN_ID INT NOT NULL,
    ITEM_ID INT NOT NULL,
    ITEM_CODE VARCHAR(50),
    ITEM_NAME VARCHAR(100),
    
    RETURN_QUANTITY DECIMAL(12,2) DEFAULT 0,
    WASTAGE_QUANTITY DECIMAL(12,2) DEFAULT 0,

-- Conversion tracking
HAS_CONVERSION TINYINT(1) DEFAULT 0,
    
    IS_ACTIVE TINYINT(1) DEFAULT 1,
    CREATED_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (RETURN_ITEM_ID),
    KEY idx_return_id (RETURN_ID),
    CONSTRAINT fk_return_items FOREIGN KEY (RETURN_ID) REFERENCES store_lorry_returns(RETURN_ID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- =====================================================
-- VIEWS FOR REPORTING
-- =====================================================

-- View: Stock operations summary with type labels
CREATE OR REPLACE VIEW v_stock_operations_summary AS
SELECT
    so.*,
    CASE so.OP_TYPE
        WHEN 1 THEN 'Full Stock Clearance (Standard)'
        WHEN 2 THEN 'Partial Stock Clearance (Standard)'
        WHEN 3 THEN 'Full Stock Clearance with Sales Bill'
        WHEN 4 THEN 'Partial Stock Clearance with Sales Bill'
        WHEN 5 THEN 'Stock Transfer Store 1 → Store 2'
        WHEN 6 THEN 'Stock Transfer with Full Clearance'
        WHEN 7 THEN 'Partial Stock Clearance with Lorry'
        WHEN 8 THEN 'Full Stock Clearance with Lorry'
        WHEN 9 THEN 'Item Conversion'
        ELSE 'Unknown'
    END AS OP_TYPE_NAME,
    (
        SELECT COUNT(*)
        FROM store_stock_operation_items
        WHERE
            OP_ID = so.OP_ID
            AND IS_ACTIVE = 1
    ) as ITEM_COUNT,
    (
        SELECT COUNT(*)
        FROM
            store_stock_operation_conversions
        WHERE
            OP_ID = so.OP_ID
            AND IS_ACTIVE = 1
    ) as CONVERSION_COUNT
FROM store_stock_operations so
WHERE
    so.IS_ACTIVE = 1;

-- View: Pending lorry returns
CREATE OR REPLACE VIEW v_pending_lorry_returns AS
SELECT
    so.OP_ID,
    so.OP_CODE,
    so.OP_TYPE,
    so.LORRY_NAME,
    so.DRIVER_NAME,
    so.DESTINATION,
    so.RETURN_STATUS,
    so.CREATED_DATE as CLEARANCE_DATE,
    so.CREATED_BY_NAME,
    (
        SELECT SUM(CLEARED_QUANTITY)
        FROM store_stock_operation_items
        WHERE
            OP_ID = so.OP_ID
            AND IS_ACTIVE = 1
    ) as TOTAL_CLEARED,
    (
        SELECT COALESCE(SUM(RETURN_QUANTITY), 0)
        FROM store_lorry_returns
        WHERE
            OP_ID = so.OP_ID
            AND IS_ACTIVE = 1
    ) as TOTAL_RETURNED,
    DATEDIFF(NOW(), so.CREATED_DATE) as DAYS_SINCE_CLEARANCE
FROM store_stock_operations so
WHERE
    so.IS_ACTIVE = 1
    AND so.OP_TYPE IN (7, 8)
    AND (
        so.RETURN_STATUS IS NULL
        OR so.RETURN_STATUS = 'PENDING'
        OR so.RETURN_STATUS = 'PARTIAL_RETURN'
    )
ORDER BY so.CREATED_DATE DESC;

-- View: Pending transfers for approval
CREATE OR REPLACE VIEW v_pending_transfers AS
SELECT t.*, so.OP_CODE, so.COMMENTS as OP_COMMENTS
FROM
    store_stock_transfers t
    LEFT JOIN store_stock_operations so ON t.OP_ID = so.OP_ID
WHERE
    t.IS_ACTIVE = 1
    AND t.STATUS = 'PENDING'
ORDER BY t.INITIATED_DATE DESC;