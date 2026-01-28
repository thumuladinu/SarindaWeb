-- 1. Add WEIGHT_CODE column if it doesn't exist
-- Note: Run this line first. If it fails because column exists, ignore and proceed.
ALTER TABLE store_transactions
ADD COLUMN WEIGHT_CODE VARCHAR(50) DEFAULT NULL;

CREATE INDEX idx_store_transactions_weight_code ON store_transactions (WEIGHT_CODE);

-- 2. Add STOCK_DATE column if it doesn't exist
-- Note: Run this line second. If it fails because column exists, ignore and proceed.
ALTER TABLE store_transactions
ADD COLUMN STOCK_DATE DATETIME DEFAULT NULL;

CREATE INDEX idx_store_transactions_stock_date ON store_transactions (STOCK_DATE);

-- 3. Backfill WEIGHT_CODE from COMMENTS for existing Store 2 transactions
-- This extracts the code from the pattern "[Store 2 QR: CODE]"
UPDATE store_transactions
SET
    WEIGHT_CODE = SUBSTRING_INDEX(
        SUBSTRING_INDEX(COMMENTS, '[Store 2 QR: ', -1),
        ']',
        1
    )
WHERE
    STORE_NO = 2
    AND COMMENTS LIKE '%[Store 2 QR:%'
    AND (
        WEIGHT_CODE IS NULL
        OR WEIGHT_CODE = ''
    );

-- 3.5. Standardize Store 2 WEIGHT_CODE to include 'S2-' prefix if missing
-- The QR codes in comments often lack the prefix stored in weight_measurements
UPDATE store_transactions
SET
    WEIGHT_CODE = CONCAT('S2-', WEIGHT_CODE)
WHERE
    STORE_NO = 2
    AND WEIGHT_CODE IS NOT NULL
    AND WEIGHT_CODE NOT LIKE 'S2-%';

-- 4. Initial Backfill: Set STOCK_DATE to CREATED_DATE for ALL records
-- This ensures every record has a valid stock date to start with
UPDATE store_transactions
SET
    STOCK_DATE = CREATED_DATE
WHERE
    STOCK_DATE IS NULL;

-- 5. Fix Store 2 STOCK_DATE based on Weighting Records
-- Join with weight_measurements to get the original arrival time
-- Note: Uses COLLATE utf8mb4_general_ci to handle potential collation mismatches
UPDATE store_transactions t
JOIN weight_measurements wm ON t.WEIGHT_CODE = wm.CODE COLLATE utf8mb4_general_ci
SET
    t.STOCK_DATE = wm.CREATED_DATE
WHERE
    t.STORE_NO = 2
    AND t.WEIGHT_CODE IS NOT NULL
    AND wm.IS_ACTIVE = 1;

-- Verification Query (Optional - Run to check results)
-- SELECT CODE, CREATED_DATE, STOCK_DATE, WEIGHT_CODE FROM store_transactions WHERE STORE_NO = 2 AND WEIGHT_CODE IS NOT NULL LIMIT 10;