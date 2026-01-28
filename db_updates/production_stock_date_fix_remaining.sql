-- PART 2: Remaining Production Updates
-- Run this to finish the Stock Date fix

-- 1. Standardize Store 2 WEIGHT_CODE to include 'S2-' prefix if missing
-- Crucial: The codes extracted from comments (e.g., '20260128-BU53') validly need 'S2-' to match weight_measurements table
UPDATE store_transactions
SET
    WEIGHT_CODE = CONCAT('S2-', WEIGHT_CODE)
WHERE
    STORE_NO = 2
    AND WEIGHT_CODE IS NOT NULL
    AND WEIGHT_CODE != ''
    AND WEIGHT_CODE NOT LIKE 'S2-%';

-- 2. Fix Store 2 STOCK_DATE based on Weighting Records
-- Now that prefixes match, this join will correctly find the Weighting Record and use its creation date
-- Note: Uses COLLATE utf8mb4_general_ci to handle potential collation mismatches
UPDATE store_transactions t
JOIN weight_measurements wm ON t.WEIGHT_CODE = wm.CODE COLLATE utf8mb4_general_ci
SET
    t.STOCK_DATE = wm.CREATED_DATE
WHERE
    t.STORE_NO = 2
    AND t.WEIGHT_CODE IS NOT NULL
    AND wm.IS_ACTIVE = 1;

-- 3. Cleanup: Remove 'S2-' prefix from WEIGHT_CODE (User Request)
-- We switch back to the short code format for the valid column data
UPDATE store_transactions
SET
    WEIGHT_CODE =
REPLACE (WEIGHT_CODE, 'S2-', '')
WHERE
    STORE_NO = 2
    AND WEIGHT_CODE LIKE 'S2-%';

-- Verification: Check a few records
-- SELECT CODE, WEIGHT_CODE, STOCK_DATE FROM store_transactions WHERE STORE_NO = 2 AND WEIGHT_CODE IS NOT NULL LIMIT 5;