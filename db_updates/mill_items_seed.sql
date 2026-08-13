-- Seed Mill Items for Chamika Rice Mill System
CREATE TABLE IF NOT EXISTS `mill_items` (
  `ITEM_ID` INT AUTO_INCREMENT PRIMARY KEY,
  `SYSTEM_CODE` VARCHAR(100) UNIQUE NOT NULL,
  `CODE` VARCHAR(100),
  `CATEGORY` VARCHAR(50) NOT NULL,
  `NAME` VARCHAR(255) NOT NULL,
  `UNIT` VARCHAR(20) DEFAULT 'kg',
  `BUYING_PRICE` DECIMAL(10,2) DEFAULT 0.00,
  `SELLING_PRICE` DECIMAL(10,2) DEFAULT 0.00,
  `IS_ACTIVE` TINYINT(1) DEFAULT 1,
  `CREATED_AT` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO `mill_items` (`SYSTEM_CODE`, `CODE`, `CATEGORY`, `NAME`, `UNIT`, `BUYING_PRICE`, `SELLING_PRICE`, `IS_ACTIVE`) VALUES
('RAW_RATHU_KAKULU', 'RAW_RATHU_KAKULU', 'raw_input', 'වී රතු කැකුළු', 'kg', 0.00, 0.00, 1),
('RAW_SUDU_KAKULU', 'RAW_SUDU_KAKULU', 'raw_input', 'වී සුදු කැකුළු', 'kg', 0.00, 0.00, 1),
('RAW_NADU', 'RAW_NADU', 'raw_input', 'වී නාඩු', 'kg', 0.00, 0.00, 0),
('OUT_RATHU_KAKULU_P', 'OUT_RATHU_KAKULU_P', 'output', 'රතු කැකුළු හාල් (P)', 'kg', 0.00, 220.00, 1),
('OUT_RATHU_KAKULU_N', 'OUT_RATHU_KAKULU_N', 'output', 'රතු කැකුළු හාල් (N)', 'kg', 0.00, 230.00, 1),
('OUT_SUDU_KAKULU_P', 'OUT_SUDU_KAKULU_P', 'output', 'සුදු කැකුළු හාල් (P)', 'kg', 0.00, 210.00, 1),
('OUT_SUDU_KAKULU_N', 'OUT_SUDU_KAKULU_N', 'output', 'සුදු කැකුළු හාල් (N)', 'kg', 0.00, 220.00, 1),
('OUT_NADU_P', 'OUT_NADU_P', 'output', 'නාඩු හාල් (P)', 'kg', 0.00, 0.00, 0),
('OUT_NADU_N', 'OUT_NADU_N', 'output', 'නාඩු හාල් (N)', 'kg', 0.00, 0.00, 0),
('OUT_KUDU', 'OUT_KUDU', 'by_product', 'කුඩු (Kudu)', 'kg', 0.00, 80.00, 1),
('OUT_HUNSAL', 'OUT_HUNSAL', 'by_product', 'හුන්සාල් (Hunsal)', 'kg', 0.00, 150.00, 1)
ON DUPLICATE KEY UPDATE 
  `NAME` = VALUES(`NAME`),
  `IS_ACTIVE` = VALUES(`IS_ACTIVE`);
