-- ============================================================
-- CHAMIKA RICE MILL — BUY SECTION TABLES
-- Phase 1: Items Enhancement, Places, Stock Inward, Inventory Ledger
-- Date: 2026-07-22
-- ============================================================

-- ============================================================
-- SECTION 1 — Enhance mill_items with category/sub_type/unit
-- ============================================================

ALTER TABLE mill_items 
    ADD COLUMN CATEGORY ENUM('raw_input', 'output', 'by_product', 'seasonal', 'other') DEFAULT 'raw_input' AFTER CODE,
    ADD COLUMN SUB_TYPE VARCHAR(50) DEFAULT NULL AFTER CATEGORY,
    ADD COLUMN UNIT VARCHAR(20) DEFAULT 'kg' AFTER SUB_TYPE;

-- ============================================================
-- SECTION 2 — Mill Places (Districts / Source Locations)
-- ============================================================

CREATE TABLE IF NOT EXISTS mill_places (
    PLACE_ID        INT AUTO_INCREMENT PRIMARY KEY,
    NAME            VARCHAR(100) NOT NULL,
    DISTRICT        VARCHAR(100),
    DESCRIPTION     VARCHAR(255),
    IS_ACTIVE       TINYINT DEFAULT 1,
    CREATED_DATE    DATETIME DEFAULT CURRENT_TIMESTAMP,
    EDITED_DATE     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- SECTION 3 — Mill Stock Inward (Buy records — 3 types)
--   store_transfer  — Transferred from stores (dual weighing)
--   mill_purchase    — Suppliers come to mill and sell
--   go_and_get       — Mill sends vehicle to collect
-- ============================================================

CREATE TABLE IF NOT EXISTS mill_stock_inward (
    INWARD_ID           INT AUTO_INCREMENT PRIMARY KEY,
    INWARD_TYPE         ENUM('store_transfer', 'mill_purchase', 'go_and_get') NOT NULL,
    REFERENCE_NO        VARCHAR(50),

    -- Item & Place
    ITEM_ID             INT NOT NULL,
    PLACE_ID            INT,

    -- Quantities (all in the item's UNIT)
    QUANTITY            DECIMAL(10,2) NOT NULL DEFAULT 0,
    SOURCE_QUANTITY     DECIMAL(10,2) DEFAULT NULL,
    SURPLUS_WASTAGE     DECIMAL(10,2) DEFAULT NULL,

    -- Pricing
    PRICE_PER_UNIT      DECIMAL(10,2) DEFAULT NULL,
    TOTAL_PRICE         DECIMAL(12,2) DEFAULT NULL,

    -- Bags
    NO_OF_BAGS          INT DEFAULT NULL,

    -- Store Transfer specific
    STORE_NO            INT DEFAULT NULL,
    STORE_TRANSFER_REF  VARCHAR(100) DEFAULT NULL,

    -- Go and Get specific
    VEHICLE_NO          VARCHAR(50) DEFAULT NULL,
    DRIVER_NAME         VARCHAR(100) DEFAULT NULL,

    -- Mill Purchase specific
    SUPPLIER_ID         INT DEFAULT NULL,

    -- Common
    DATE                DATE NOT NULL,
    NOTES               TEXT,
    RECEIVED_BY         VARCHAR(100),
    CREATED_BY          INT,

    -- Sync fields (for offline-first Electron app)
    IS_SYNCED           TINYINT DEFAULT 1,
    LOCAL_ID            VARCHAR(100) DEFAULT NULL,
    SYNC_TIMESTAMP      DATETIME DEFAULT NULL,

    IS_ACTIVE           TINYINT DEFAULT 1,
    CREATED_DATE        DATETIME DEFAULT CURRENT_TIMESTAMP,
    EDITED_DATE         DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_inward_type (INWARD_TYPE),
    INDEX idx_inward_item (ITEM_ID),
    INDEX idx_inward_place (PLACE_ID),
    INDEX idx_inward_date (DATE),
    INDEX idx_inward_local_id (LOCAL_ID)
);

-- ============================================================
-- SECTION 4 — Mill Inventory Ledger (per item + per place tracking)
-- ============================================================

CREATE TABLE IF NOT EXISTS mill_inventory_ledger (
    LEDGER_ID           INT AUTO_INCREMENT PRIMARY KEY,
    ITEM_ID             INT NOT NULL,
    PLACE_ID            INT DEFAULT NULL,

    TYPE                ENUM('IN', 'OUT', 'ADJ_IN', 'ADJ_OUT') NOT NULL,
    QUANTITY            DECIMAL(10,2) NOT NULL DEFAULT 0,
    BALANCE_AFTER       DECIMAL(10,2) DEFAULT NULL,

    REFERENCE_TYPE      VARCHAR(50),
    REFERENCE_ID        INT DEFAULT NULL,

    DATE                DATE NOT NULL,
    NOTES               TEXT,
    CREATED_BY          INT,

    IS_ACTIVE           TINYINT DEFAULT 1,
    CREATED_DATE        DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_ledger_item (ITEM_ID),
    INDEX idx_ledger_place (PLACE_ID),
    INDEX idx_ledger_date (DATE),
    INDEX idx_ledger_ref (REFERENCE_TYPE, REFERENCE_ID)
);

-- ============================================================
-- SECTION 5 — Mill Stock Transfers (linked to store_stock_transfers)
--   Separate table so mill can track its side of the transfer
--   with additional mill-specific fields (mill weight, pricing)
-- ============================================================

CREATE TABLE IF NOT EXISTS mill_stock_transfers (
    MILL_TRANSFER_ID    INT AUTO_INCREMENT PRIMARY KEY,
    STORE_TRANSFER_ID   INT DEFAULT NULL,
    STORE_NO            INT NOT NULL,

    ITEM_ID             INT NOT NULL,
    PLACE_ID            INT DEFAULT NULL,

    -- Store side measurements
    STORE_QUANTITY      DECIMAL(10,2) DEFAULT NULL,
    STORE_NO_OF_BAGS    INT DEFAULT NULL,

    -- Mill side measurements
    MILL_QUANTITY       DECIMAL(10,2) DEFAULT NULL,
    MILL_NO_OF_BAGS     INT DEFAULT NULL,

    -- Calculated
    SURPLUS_WASTAGE     DECIMAL(10,2) DEFAULT NULL,

    -- Pricing (added when received at mill)
    PRICE_PER_UNIT      DECIMAL(10,2) DEFAULT NULL,
    TOTAL_PRICE         DECIMAL(12,2) DEFAULT NULL,

    -- Status
    STATUS              ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
    ACCEPTED_BY         VARCHAR(100),
    ACCEPTED_DATE       DATETIME DEFAULT NULL,

    DATE                DATE NOT NULL,
    NOTES               TEXT,
    CREATED_BY          INT,

    IS_ACTIVE           TINYINT DEFAULT 1,
    CREATED_DATE        DATETIME DEFAULT CURRENT_TIMESTAMP,
    EDITED_DATE         DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_mt_store (STORE_NO),
    INDEX idx_mt_item (ITEM_ID),
    INDEX idx_mt_status (STATUS),
    INDEX idx_mt_date (DATE)
);
