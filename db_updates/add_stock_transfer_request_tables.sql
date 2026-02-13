-- Add Request Transfer Tables

CREATE TABLE IF NOT EXISTS store_stock_transfers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    local_id VARCHAR(50), -- S2-REQ-TIMESTAMP
    main_item_id INT NOT NULL,
    main_item_code VARCHAR(50),
    main_item_name VARCHAR(255),
    main_item_qty DECIMAL(10, 3),
    has_conversion TINYINT(1) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, APPROVED, DECLINED
    store_from_id INT DEFAULT 1,
    store_to_id INT DEFAULT 2,
    created_by INT,
    created_by_name VARCHAR(100),
    approval_date DATETIME NULL,
    approved_by INT NULL,
    approved_by_name VARCHAR(100),
    clearance_type VARCHAR(20) NULL, -- FULL, PARTIAL
    comments TEXT,
    INDEX idx_status (status),
    INDEX idx_store_from (store_from_id)
);

CREATE TABLE IF NOT EXISTS store_stock_transfer_conversions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transfer_id INT,
    source_item_id INT,
    dest_item_id INT,
    dest_item_code VARCHAR(50),
    dest_item_name VARCHAR(255),
    dest_qty DECIMAL(10, 3),
    FOREIGN KEY (transfer_id) REFERENCES store_stock_transfers (id) ON DELETE CASCADE
);