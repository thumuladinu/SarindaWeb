-- =============================================================================
-- Chamika Rice Mill / POS Monorepo
-- Production Database Schema Updates & Migrations
-- Date: 2026-08-26
-- Description:
--   1. Added Customer Bank Account Details (JSON), Phone & Location columns to mill_customers
--   2. Added Device ID & Creator Name columns to mill_bills and mill_dispatch_notes for offline sync
--   3. Updated mill_staff profile images & user_details PIN authentication
--   4. Added GS1 barcode support to mill_items
--   5. Added Paddy condition, dry percentage, and gross weight to mill_stock_inward
-- =============================================================================

USE `sarinda`; -- Change to your production database name if different

-- -----------------------------------------------------------------------------
-- 1. MILL CUSTOMERS TABLE UPDATES (Multi-Bank Accounts, Phone, Location)
-- -----------------------------------------------------------------------------
SET @dbname = DATABASE();
SET @tablename = "mill_customers";

-- Add BANK_DETAILS_JSON
SET @columnname = "BANK_DETAILS_JSON";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  "SELECT 1",
  "ALTER TABLE mill_customers ADD COLUMN BANK_DETAILS_JSON LONGTEXT NULL AFTER ADDRESS"
));
PREPARE add_bank_col FROM @preparedStatement;
EXECUTE add_bank_col;
DEALLOCATE PREPARE add_bank_col;

-- Add PHONE
SET @columnname = "PHONE";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  "SELECT 1",
  "ALTER TABLE mill_customers ADD COLUMN PHONE VARCHAR(50) NULL AFTER PHONE_NUMBER"
));
PREPARE add_phone_col FROM @preparedStatement;
EXECUTE add_phone_col;
DEALLOCATE PREPARE add_phone_col;

-- Add LOCATION
SET @columnname = "LOCATION";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  "SELECT 1",
  "ALTER TABLE mill_customers ADD COLUMN LOCATION VARCHAR(255) NULL AFTER PHONE"
));
PREPARE add_location_col FROM @preparedStatement;
EXECUTE add_location_col;
DEALLOCATE PREPARE add_location_col;


-- -----------------------------------------------------------------------------
-- 2. MILL SALES BILLS TABLE UPDATES (Device Sync & Creator Name)
-- -----------------------------------------------------------------------------
SET @tablename = "mill_bills";

-- Add DEVICE_ID
SET @columnname = "DEVICE_ID";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  "SELECT 1",
  "ALTER TABLE mill_bills ADD COLUMN DEVICE_ID VARCHAR(50) NULL"
));
PREPARE add_dev_bill FROM @preparedStatement;
EXECUTE add_dev_bill;
DEALLOCATE PREPARE add_dev_bill;

-- Add CREATED_BY_NAME
SET @columnname = "CREATED_BY_NAME";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  "SELECT 1",
  "ALTER TABLE mill_bills ADD COLUMN CREATED_BY_NAME VARCHAR(100) NULL"
));
PREPARE add_creator_bill FROM @preparedStatement;
EXECUTE add_creator_bill;
DEALLOCATE PREPARE add_creator_bill;

-- Add DISPATCH_NO
SET @columnname = "DISPATCH_NO";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  "SELECT 1",
  "ALTER TABLE mill_bills ADD COLUMN DISPATCH_NO VARCHAR(50) NULL"
));
PREPARE add_dispatch_no_bill FROM @preparedStatement;
EXECUTE add_dispatch_no_bill;
DEALLOCATE PREPARE add_dispatch_no_bill;


-- -----------------------------------------------------------------------------
-- 3. MILL DISPATCH NOTES TABLE UPDATES
-- -----------------------------------------------------------------------------
SET @tablename = "mill_dispatch_notes";

-- Add DEVICE_ID
SET @columnname = "DEVICE_ID";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  "SELECT 1",
  "ALTER TABLE mill_dispatch_notes ADD COLUMN DEVICE_ID VARCHAR(50) NULL"
));
PREPARE add_dev_disp FROM @preparedStatement;
EXECUTE add_dev_disp;
DEALLOCATE PREPARE add_dev_disp;

-- Add CREATED_BY_NAME
SET @columnname = "CREATED_BY_NAME";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  "SELECT 1",
  "ALTER TABLE mill_dispatch_notes ADD COLUMN CREATED_BY_NAME VARCHAR(100) NULL"
));
PREPARE add_creator_disp FROM @preparedStatement;
EXECUTE add_creator_disp;
DEALLOCATE PREPARE add_creator_disp;

-- Modify CREATED_BY column to allow string IDs or device codes
ALTER TABLE mill_dispatch_notes MODIFY COLUMN CREATED_BY VARCHAR(100) NULL;


-- -----------------------------------------------------------------------------
-- 4. MILL STAFF & USER DETAILS UPDATES (Profile Photos & Quick PIN Login)
-- -----------------------------------------------------------------------------
SET @tablename = "mill_staff";
SET @columnname = "PROFILE_IMAGE";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  "SELECT 1",
  "ALTER TABLE mill_staff ADD COLUMN PROFILE_IMAGE LONGTEXT DEFAULT NULL"
));
PREPARE add_profile_img FROM @preparedStatement;
EXECUTE add_profile_img;
DEALLOCATE PREPARE add_profile_img;

SET @tablename = "user_details";
SET @columnname = "PIN";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  "SELECT 1",
  "ALTER TABLE user_details ADD COLUMN PIN VARCHAR(10) NULL"
));
PREPARE add_user_pin FROM @preparedStatement;
EXECUTE add_user_pin;
DEALLOCATE PREPARE add_user_pin;


-- -----------------------------------------------------------------------------
-- 5. MILL ITEMS GS1 BARCODE SUPPORT
-- -----------------------------------------------------------------------------
SET @tablename = "mill_items";
SET @columnname = "GS1_CODE";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  "SELECT 1",
  "ALTER TABLE mill_items ADD COLUMN GS1_CODE VARCHAR(100) NULL"
));
PREPARE add_gs1_col FROM @preparedStatement;
EXECUTE add_gs1_col;
DEALLOCATE PREPARE add_gs1_col;


-- -----------------------------------------------------------------------------
-- 6. STOCK INWARD QUALITY & WEIGHT TRACKING
-- -----------------------------------------------------------------------------
SET @tablename = "mill_stock_inward";

SET @columnname = "CONDITION";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  "SELECT 1",
  "ALTER TABLE mill_stock_inward ADD COLUMN `CONDITION` VARCHAR(20) DEFAULT 'dry'"
));
PREPARE add_cond_col FROM @preparedStatement;
EXECUTE add_cond_col;
DEALLOCATE PREPARE add_cond_col;

SET @columnname = "DRY_PERCENTAGE";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  "SELECT 1",
  "ALTER TABLE mill_stock_inward ADD COLUMN `DRY_PERCENTAGE` DECIMAL(5,2) DEFAULT 100.00"
));
PREPARE add_dry_col FROM @preparedStatement;
EXECUTE add_dry_col;
DEALLOCATE PREPARE add_dry_col;

SET @columnname = "GROSS_WEIGHT";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  "SELECT 1",
  "ALTER TABLE mill_stock_inward ADD COLUMN `GROSS_WEIGHT` DECIMAL(12,2) DEFAULT NULL"
));
PREPARE add_gross_col FROM @preparedStatement;
EXECUTE add_gross_col;
DEALLOCATE PREPARE add_gross_col;

-- =============================================================================
-- DIRECT ALTER COMMANDS FOR QUICK PASTE (ALTERNATIVE):
-- =============================================================================
/*
ALTER TABLE mill_customers ADD COLUMN BANK_DETAILS_JSON LONGTEXT NULL;
ALTER TABLE mill_customers ADD COLUMN PHONE VARCHAR(50) NULL;
ALTER TABLE mill_customers ADD COLUMN LOCATION VARCHAR(255) NULL;

ALTER TABLE mill_bills ADD COLUMN DEVICE_ID VARCHAR(50) NULL;
ALTER TABLE mill_bills ADD COLUMN CREATED_BY_NAME VARCHAR(100) NULL;
ALTER TABLE mill_bills ADD COLUMN DISPATCH_NO VARCHAR(50) NULL;

ALTER TABLE mill_dispatch_notes ADD COLUMN DEVICE_ID VARCHAR(50) NULL;
ALTER TABLE mill_dispatch_notes ADD COLUMN CREATED_BY_NAME VARCHAR(100) NULL;
ALTER TABLE mill_dispatch_notes MODIFY COLUMN CREATED_BY VARCHAR(100) NULL;

ALTER TABLE mill_staff ADD COLUMN PROFILE_IMAGE LONGTEXT DEFAULT NULL;
ALTER TABLE user_details ADD COLUMN PIN VARCHAR(10) NULL;

ALTER TABLE mill_items ADD COLUMN GS1_CODE VARCHAR(100) NULL;

ALTER TABLE mill_stock_inward ADD COLUMN `CONDITION` VARCHAR(20) DEFAULT 'dry';
ALTER TABLE mill_stock_inward ADD COLUMN `DRY_PERCENTAGE` DECIMAL(5,2) DEFAULT 100.00;
ALTER TABLE mill_stock_inward ADD COLUMN `GROSS_WEIGHT` DECIMAL(12,2) DEFAULT NULL;
*/
