-- Fix double clearance data error on S2-260909-CLR-OMKRQ-002
UPDATE store_stock_operation_items ssoi
JOIN store_stock_operations sso ON ssoi.OP_ID = sso.OP_ID
SET ssoi.ORIGINAL_STOCK = 29.5, ssoi.CLEARED_QUANTITY = 29.5
WHERE sso.OP_CODE = 'S2-260909-CLR-OMKRQ-002';

UPDATE store_stock_operations
SET WASTAGE_AMOUNT = 29.5
WHERE OP_CODE = 'S2-260909-CLR-OMKRQ-002';

UPDATE store_transactions_items sti
JOIN store_transactions st ON sti.TRANSACTION_ID = st.TRANSACTION_ID
SET sti.QUANTITY = 29.5
WHERE st.COMMENTS LIKE '%[S2-260909-CLR-OMKRQ-002]%';
