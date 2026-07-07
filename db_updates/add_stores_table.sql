-- ============================================================
-- Migration: add stores master table + seed legacy stores
-- Date:      2026-04-27
-- Reason:    Multi-store scalability for POS app.
-- Notes:     Additive only. No FK enforced; legacy rows with
--            STORE_NO=1,2 keep working untouched.
-- Tracked in: ../../dbchages.txt (Section 1 + Section 2)
-- ============================================================

CREATE TABLE IF NOT EXISTS stores (
  STORE_NO              INT PRIMARY KEY,
  NAME                  VARCHAR(100) NOT NULL,
  ADDRESS               VARCHAR(255),
  STORE_CODE            VARCHAR(8) NOT NULL UNIQUE,
  IS_ACTIVE             TINYINT DEFAULT 1,
  IS_WEIGHING_STATION   TINYINT DEFAULT 0,
  COLOR                 VARCHAR(20) DEFAULT 'blue',
  CREATED_DATE          DATETIME DEFAULT CURRENT_TIMESTAMP,
  EDITED_DATE           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  TRIP_COUNTER          INT DEFAULT 0
);

INSERT IGNORE INTO stores (STORE_NO, NAME, STORE_CODE, IS_WEIGHING_STATION, COLOR)
VALUES
  (1, 'Main Store',       'STORE01', 0, 'blue'),
  (2, 'Weighing Station', 'WEIGH02', 1, 'violet');

-- Per-store item visibility (run after store_items exists)
ALTER TABLE store_items
  ADD COLUMN IF NOT EXISTS STORE_VISIBILITY JSON DEFAULT NULL
  AFTER SHOW_IN_WEIGHING;

UPDATE store_items
SET STORE_VISIBILITY = JSON_OBJECT('1', 1, '2', IF(SHOW_IN_WEIGHING = 0, 0, 1))
WHERE STORE_VISIBILITY IS NULL;
