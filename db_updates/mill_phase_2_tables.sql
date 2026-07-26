-- ============================================================
-- CHAMIKA RICE MILL — PHASE 2 TABLES
-- Phase 2: Drying Operations, Yield Configs, System Items
-- Date: 2026-07-26
-- ============================================================

-- ============================================================
-- SECTION 1 — System Codes for Core Items
-- ============================================================

-- Add SYSTEM_CODE if it doesn't exist (using standard syntax assuming it might not exist)
-- Note: MySQL doesn't natively support "ADD COLUMN IF NOT EXISTS" without a procedure,
-- so this assumes the column isn't there yet. If it is, this line will throw a safe error.
ALTER TABLE mill_items ADD COLUMN SYSTEM_CODE VARCHAR(50) UNIQUE DEFAULT NULL AFTER ITEM_ID;

-- Insert defaults if they do not exist
INSERT IGNORE INTO mill_items (SYSTEM_CODE, CODE, NAME, CATEGORY, SUB_TYPE, UNIT, BUYING_PRICE, SELLING_PRICE, IS_ACTIVE) VALUES
('RAW_WEE_AMU', 'WEE-AMU', 'Amu Wee (Wet Paddy)', 'raw_input', 'wet', 'kg', 100, 120, 1),
('RAW_WEE_DRY', 'WEE-DRY', 'Welapu Wee (Dry Paddy)', 'raw_input', 'dry', 'kg', 120, 140, 1),
('OUT_HAL', 'HAL', 'Hal (Rice)', 'output', 'hal', 'kg', 0, 200, 1),
('OUT_KUDU', 'KUDU', 'Kudu (Bran)', 'by_product', 'kudu', 'kg', 0, 50, 1),
('OUT_HUNSAL', 'HUNSAL', 'Hunsal (Broken)', 'by_product', 'hunsal', 'kg', 0, 80, 1);

-- ============================================================
-- SECTION 2 — Drying Operations (Amu -> Dry)
-- ============================================================

CREATE TABLE IF NOT EXISTS mill_drying_operations (
    OP_ID INT AUTO_INCREMENT PRIMARY KEY,
    INWARD_ID INT NOT NULL, -- Links to the inward batch of Amu Wee
    ORIGINAL_WEIGHT DECIMAL(10,2) NOT NULL,
    MOISTURE_LOSS_PERCENT DECIMAL(5,2) NOT NULL DEFAULT 15.00,
    FINAL_DRY_WEIGHT DECIMAL(10,2) NOT NULL,
    DATE DATE NOT NULL,
    CREATED_BY INT,
    CREATED_DATE DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_drying_inward (INWARD_ID),
    INDEX idx_drying_date (DATE)
);

-- ============================================================
-- SECTION 3 — Yield Configurations
-- ============================================================

CREATE TABLE IF NOT EXISTS mill_yield_configs (
    CONFIG_ID INT AUTO_INCREMENT PRIMARY KEY,
    HAL_YIELD DECIMAL(5,2) NOT NULL DEFAULT 65.00,
    KUDU_YIELD DECIMAL(5,2) NOT NULL DEFAULT 4.00,
    HUNSAL_YIELD DECIMAL(5,2) NOT NULL DEFAULT 2.00,
    WASTE_YIELD DECIMAL(5,2) NOT NULL DEFAULT 29.00,
    UPDATED_BY INT,
    UPDATED_DATE DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert the default configuration
INSERT INTO mill_yield_configs (HAL_YIELD, KUDU_YIELD, HUNSAL_YIELD, WASTE_YIELD)
SELECT 65.00, 4.00, 2.00, 29.00
WHERE NOT EXISTS (SELECT 1 FROM mill_yield_configs);

-- ============================================================
-- SECTION 4 — Billing / Sales Tracking (Basic Structure)
-- ============================================================

CREATE TABLE IF NOT EXISTS mill_bills (
    BILL_ID INT AUTO_INCREMENT PRIMARY KEY,
    INVOICE_NO VARCHAR(50) UNIQUE NOT NULL,
    CUSTOMER_ID INT DEFAULT NULL,
    TOTAL_AMOUNT DECIMAL(12,2) NOT NULL DEFAULT 0,
    DISCOUNT DECIMAL(12,2) DEFAULT 0,
    NET_AMOUNT DECIMAL(12,2) NOT NULL DEFAULT 0,
    DATE DATE NOT NULL,
    PAYMENT_METHOD ENUM('cash', 'card', 'credit') DEFAULT 'cash',
    CREATED_BY INT,
    CREATED_DATE DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_bill_date (DATE),
    INDEX idx_bill_customer (CUSTOMER_ID)
);

CREATE TABLE IF NOT EXISTS mill_bill_items (
    BILL_ITEM_ID INT AUTO_INCREMENT PRIMARY KEY,
    BILL_ID INT NOT NULL,
    ITEM_ID INT NOT NULL,
    QUANTITY DECIMAL(10,2) NOT NULL,
    UNIT_PRICE DECIMAL(10,2) NOT NULL,
    TOTAL_PRICE DECIMAL(12,2) NOT NULL,
    -- Estimations (calculated at time of sale)
    ESTIMATED_INPUT_USED DECIMAL(10,2) DEFAULT 0, -- e.g. how much Dry Wee was used
    ESTIMATED_KUDU_GENERATED DECIMAL(10,2) DEFAULT 0,
    ESTIMATED_HUNSAL_GENERATED DECIMAL(10,2) DEFAULT 0,
    INDEX idx_bitem_bill (BILL_ID),
    INDEX idx_bitem_item (ITEM_ID)
);
