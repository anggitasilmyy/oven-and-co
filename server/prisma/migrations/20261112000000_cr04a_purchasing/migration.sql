-- CR-04a · Step 6.8 CP2 · FR-41 – FR-44 · 9 tabel baru (30 → 39)
-- Sumber: docs/change-requests/CR-04_DRAFT_0.8.3.md §12.1 – §12.2, §11.3 M-7; Errata E1 B.1 – B.2; Errata E1.1 §1.
-- DDL (CREATE TABLE & FK) dihasilkan `prisma migrate diff` dari schema.prisma. CHECK constraint ditulis manual (Prisma
-- tidak memodelkan CHECK). Semua FK CR-04 ON DELETE RESTRICT ON UPDATE RESTRICT. Tabel lama tidak diubah.
-- Prosedur produksi: jalankan HANYA dalam jendela maintenance M-0 – M-9 (fencing akun aplikasi, snapshot M-4, backup
-- M-5/M-6). Kegagalan → pemulihan §11.4 (restore backup), bukan eksekusi ulang parsial.

-- CreateTable
CREATE TABLE `operation_requests` (
    `request_id` CHAR(36) NOT NULL,
    `operation` VARCHAR(40) NOT NULL,
    `actor_id` BIGINT NOT NULL,
    `target_type` VARCHAR(30) NULL,
    `target_id` BIGINT NULL,
    `payload_hash` CHAR(64) NOT NULL,
    `response_status` SMALLINT NOT NULL,
    `response_body` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ix_opreq_actor`(`actor_id`),
    INDEX `ix_opreq_target`(`target_type`, `target_id`),
    PRIMARY KEY (`request_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suppliers` (
    `supplier_id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `email` VARCHAR(100) NOT NULL,
    `address` VARCHAR(255) NOT NULL,
    `contact_person` VARCHAR(100) NOT NULL,
    `note` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` BIGINT NOT NULL,
    `created_request_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uq_supplier_name`(`name`),
    UNIQUE INDEX `uq_supplier_req`(`created_request_id`),
    INDEX `ix_supplier_active`(`is_active`),
    PRIMARY KEY (`supplier_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supplier_materials` (
    `supplier_id` BIGINT NOT NULL,
    `material_id` BIGINT NOT NULL,

    INDEX `ix_supmat_material`(`material_id`),
    PRIMARY KEY (`supplier_id`, `material_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_orders` (
    `po_id` BIGINT NOT NULL AUTO_INCREMENT,
    `po_number` VARCHAR(20) NOT NULL,
    `supplier_id` BIGINT NOT NULL,
    `status` ENUM('draft', 'dipesan', 'diterima_sebagian', 'diterima', 'dibatalkan') NOT NULL DEFAULT 'draft',
    `note` VARCHAR(255) NULL,
    `ordered_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `cancel_reason` VARCHAR(255) NULL,
    `created_by` BIGINT NOT NULL,
    `created_request_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uq_po_number`(`po_number`),
    UNIQUE INDEX `uq_po_req`(`created_request_id`),
    INDEX `ix_po_supplier`(`supplier_id`),
    INDEX `ix_po_status`(`status`),
    INDEX `ix_po_ordered`(`ordered_at`),
    INDEX `ix_po_cancelled`(`cancelled_at`),
    PRIMARY KEY (`po_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_order_items` (
    `po_item_id` BIGINT NOT NULL AUTO_INCREMENT,
    `po_id` BIGINT NOT NULL,
    `material_id` BIGINT NOT NULL,
    `qty_ordered` DECIMAL(10, 2) NOT NULL,
    `unit_price` DECIMAL(12, 2) NOT NULL,
    `qty_cancelled` DECIMAL(10, 2) NOT NULL DEFAULT 0,

    INDEX `ix_poi_material`(`material_id`),
    UNIQUE INDEX `uq_poi`(`po_id`, `material_id`),
    PRIMARY KEY (`po_item_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `goods_receipts` (
    `receipt_id` BIGINT NOT NULL AUTO_INCREMENT,
    `po_id` BIGINT NOT NULL,
    `kind` ENUM('normal', 'pembalik', 'pengganti') NOT NULL,
    `reverses_id` BIGINT NULL,
    `replaces_id` BIGINT NULL,
    `reason` VARCHAR(255) NULL,
    `note` VARCHAR(255) NULL,
    `operation_request_id` CHAR(36) NOT NULL,
    `created_by` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_gr_reverses`(`reverses_id`),
    UNIQUE INDEX `uq_gr_replaces`(`replaces_id`),
    INDEX `ix_gr_po`(`po_id`),
    INDEX `ix_gr_opreq`(`operation_request_id`),
    INDEX `ix_gr_created`(`created_at`),
    PRIMARY KEY (`receipt_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `goods_receipt_lines` (
    `line_id` BIGINT NOT NULL AUTO_INCREMENT,
    `receipt_id` BIGINT NOT NULL,
    `po_item_id` BIGINT NOT NULL,
    `qty` DECIMAL(10, 2) NOT NULL,

    INDEX `ix_grl_item`(`po_item_id`),
    UNIQUE INDEX `uq_grl`(`receipt_id`, `po_item_id`),
    PRIMARY KEY (`line_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_adjustments` (
    `adjustment_id` BIGINT NOT NULL AUTO_INCREMENT,
    `material_id` BIGINT NOT NULL,
    `kind` ENUM('saldo_awal', 'stok_masuk', 'pembalik_stok_masuk', 'pengganti_stok_masuk', 'stock_opname') NOT NULL,
    `qty` DECIMAL(10, 2) NULL,
    `counted_stock` DECIMAL(10, 2) NULL,
    `system_stock` DECIMAL(10, 2) NULL,
    `reverses_id` BIGINT NULL,
    `replaces_id` BIGINT NULL,
    `reason` VARCHAR(255) NULL,
    `opening_material_id` BIGINT NULL,
    `operation_request_id` CHAR(36) NULL,
    `created_by` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_sa_reverses`(`reverses_id`),
    UNIQUE INDEX `uq_sa_replaces`(`replaces_id`),
    UNIQUE INDEX `uq_sa_opening`(`opening_material_id`),
    INDEX `ix_sa_material`(`material_id`, `created_at`),
    INDEX `ix_sa_kind`(`kind`),
    PRIMARY KEY (`adjustment_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `material_movements` (
    `movement_id` BIGINT NOT NULL AUTO_INCREMENT,
    `material_id` BIGINT NOT NULL,
    `type` ENUM('saldo_awal', 'stok_masuk', 'pembalik_stok_masuk', 'koreksi_stok_masuk', 'stock_opname', 'penerimaan', 'pembalik_penerimaan', 'koreksi_penerimaan') NOT NULL,
    `qty_change` DECIMAL(10, 2) NOT NULL,
    `stock_before` DECIMAL(10, 2) NOT NULL,
    `stock_after` DECIMAL(10, 2) NOT NULL,
    `adjustment_id` BIGINT NULL,
    `receipt_id` BIGINT NULL,
    `po_item_id` BIGINT NULL,
    `created_by` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_mm_adjustment`(`adjustment_id`),
    INDEX `ix_mm_material`(`material_id`, `movement_id`),
    INDEX `ix_mm_created`(`created_at`),
    INDEX `ix_mm_type`(`type`, `created_at`),
    INDEX `ix_mm_item`(`po_item_id`),
    UNIQUE INDEX `uq_mm_receipt_item`(`receipt_id`, `po_item_id`),
    PRIMARY KEY (`movement_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `operation_requests` ADD CONSTRAINT `operation_requests_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `suppliers` ADD CONSTRAINT `suppliers_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `suppliers` ADD CONSTRAINT `suppliers_created_request_id_fkey` FOREIGN KEY (`created_request_id`) REFERENCES `operation_requests`(`request_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `supplier_materials` ADD CONSTRAINT `supplier_materials_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`supplier_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `supplier_materials` ADD CONSTRAINT `supplier_materials_material_id_fkey` FOREIGN KEY (`material_id`) REFERENCES `raw_materials`(`material_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`supplier_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_created_request_id_fkey` FOREIGN KEY (`created_request_id`) REFERENCES `operation_requests`(`request_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `purchase_order_items` ADD CONSTRAINT `purchase_order_items_po_id_fkey` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders`(`po_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `purchase_order_items` ADD CONSTRAINT `purchase_order_items_material_id_fkey` FOREIGN KEY (`material_id`) REFERENCES `raw_materials`(`material_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `goods_receipts` ADD CONSTRAINT `goods_receipts_po_id_fkey` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders`(`po_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `goods_receipts` ADD CONSTRAINT `goods_receipts_reverses_id_fkey` FOREIGN KEY (`reverses_id`) REFERENCES `goods_receipts`(`receipt_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `goods_receipts` ADD CONSTRAINT `goods_receipts_replaces_id_fkey` FOREIGN KEY (`replaces_id`) REFERENCES `goods_receipts`(`receipt_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `goods_receipts` ADD CONSTRAINT `goods_receipts_operation_request_id_fkey` FOREIGN KEY (`operation_request_id`) REFERENCES `operation_requests`(`request_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `goods_receipts` ADD CONSTRAINT `goods_receipts_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `goods_receipt_lines` ADD CONSTRAINT `goods_receipt_lines_receipt_id_fkey` FOREIGN KEY (`receipt_id`) REFERENCES `goods_receipts`(`receipt_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `goods_receipt_lines` ADD CONSTRAINT `goods_receipt_lines_po_item_id_fkey` FOREIGN KEY (`po_item_id`) REFERENCES `purchase_order_items`(`po_item_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `stock_adjustments` ADD CONSTRAINT `stock_adjustments_material_id_fkey` FOREIGN KEY (`material_id`) REFERENCES `raw_materials`(`material_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `stock_adjustments` ADD CONSTRAINT `stock_adjustments_reverses_id_fkey` FOREIGN KEY (`reverses_id`) REFERENCES `stock_adjustments`(`adjustment_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `stock_adjustments` ADD CONSTRAINT `stock_adjustments_replaces_id_fkey` FOREIGN KEY (`replaces_id`) REFERENCES `stock_adjustments`(`adjustment_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `stock_adjustments` ADD CONSTRAINT `stock_adjustments_operation_request_id_fkey` FOREIGN KEY (`operation_request_id`) REFERENCES `operation_requests`(`request_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `stock_adjustments` ADD CONSTRAINT `stock_adjustments_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `material_movements` ADD CONSTRAINT `material_movements_material_id_fkey` FOREIGN KEY (`material_id`) REFERENCES `raw_materials`(`material_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `material_movements` ADD CONSTRAINT `material_movements_adjustment_id_fkey` FOREIGN KEY (`adjustment_id`) REFERENCES `stock_adjustments`(`adjustment_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `material_movements` ADD CONSTRAINT `material_movements_receipt_id_fkey` FOREIGN KEY (`receipt_id`) REFERENCES `goods_receipts`(`receipt_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `material_movements` ADD CONSTRAINT `material_movements_po_item_id_fkey` FOREIGN KEY (`po_item_id`) REFERENCES `purchase_order_items`(`po_item_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `material_movements` ADD CONSTRAINT `material_movements_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ─── CHECK constraints (pola anti-UNKNOWN, Draft §12.1) ───────────────────────────────────────────────────────────────

ALTER TABLE `operation_requests` ADD CONSTRAINT `ck_opreq_fmt` CHECK (CHAR_LENGTH(`request_id`) = 36
  AND CHAR_LENGTH(`payload_hash`) = 64 AND CHAR_LENGTH(`operation`) > 0 AND `response_status` BETWEEN 100 AND 599);

ALTER TABLE `operation_requests` ADD CONSTRAINT `ck_opreq_target` CHECK ((`target_type` IS NULL AND `target_id` IS NULL)
  OR (`target_type` IS NOT NULL AND `target_id` IS NOT NULL));

ALTER TABLE `suppliers` ADD CONSTRAINT `ck_supplier_text` CHECK (CHAR_LENGTH(TRIM(`name`)) > 0
  AND CHAR_LENGTH(TRIM(`phone`)) > 0 AND CHAR_LENGTH(TRIM(`email`)) > 0 AND CHAR_LENGTH(TRIM(`address`)) > 0
  AND CHAR_LENGTH(TRIM(`contact_person`)) > 0);

ALTER TABLE `purchase_orders` ADD CONSTRAINT `ck_po_status` CHECK (
     (`status` = 'draft' AND `ordered_at` IS NULL AND `cancelled_at` IS NULL AND `cancel_reason` IS NULL)
  OR (`status` IN ('dipesan','diterima_sebagian','diterima') AND `ordered_at` IS NOT NULL
      AND `cancelled_at` IS NULL AND `cancel_reason` IS NULL)
  OR (`status` = 'dibatalkan' AND `cancelled_at` IS NOT NULL));

ALTER TABLE `purchase_order_items` ADD CONSTRAINT `ck_poi_values` CHECK (`qty_ordered` > 0 AND `qty_ordered` <= 99999999.99
  AND `unit_price` > 0 AND `unit_price` <= 9999999999.99
  AND `qty_cancelled` >= 0 AND `qty_cancelled` <= `qty_ordered`);

ALTER TABLE `goods_receipts` ADD CONSTRAINT `ck_gr_kind` CHECK (
     (`kind` = 'normal' AND `reverses_id` IS NULL AND `replaces_id` IS NULL AND `reason` IS NULL)
  OR (`kind` = 'pembalik' AND `reverses_id` IS NOT NULL AND `replaces_id` IS NULL
      AND `reason` IS NOT NULL AND CHAR_LENGTH(TRIM(`reason`)) > 0)
  OR (`kind` = 'pengganti' AND `replaces_id` IS NOT NULL AND `reverses_id` IS NULL
      AND `reason` IS NOT NULL AND CHAR_LENGTH(TRIM(`reason`)) > 0));

ALTER TABLE `goods_receipt_lines` ADD CONSTRAINT `ck_grl_qty` CHECK (`qty` > 0 AND `qty` <= 99999999.99);

ALTER TABLE `stock_adjustments` ADD CONSTRAINT `ck_sa_kind` CHECK (
     (`kind` = 'saldo_awal' AND `qty` IS NOT NULL AND `qty` >= 0 AND `qty` <= 99999999.99
      AND `counted_stock` IS NULL AND `system_stock` IS NULL AND `reverses_id` IS NULL AND `replaces_id` IS NULL
      AND `reason` IS NULL AND `opening_material_id` IS NOT NULL AND `opening_material_id` = `material_id`)
  OR (`kind` = 'stok_masuk' AND `qty` IS NOT NULL AND `qty` > 0 AND `qty` <= 99999999.99
      AND `counted_stock` IS NULL AND `system_stock` IS NULL AND `reverses_id` IS NULL AND `replaces_id` IS NULL
      AND `opening_material_id` IS NULL AND `created_by` IS NOT NULL)
  OR (`kind` = 'pembalik_stok_masuk' AND `qty` IS NOT NULL AND `qty` > 0 AND `qty` <= 99999999.99
      AND `counted_stock` IS NULL AND `system_stock` IS NULL AND `reverses_id` IS NOT NULL AND `replaces_id` IS NULL
      AND `reason` IS NOT NULL AND CHAR_LENGTH(TRIM(`reason`)) > 0 AND `opening_material_id` IS NULL
      AND `operation_request_id` IS NOT NULL AND `created_by` IS NOT NULL)
  OR (`kind` = 'pengganti_stok_masuk' AND `qty` IS NOT NULL AND `qty` > 0 AND `qty` <= 99999999.99
      AND `counted_stock` IS NULL AND `system_stock` IS NULL AND `replaces_id` IS NOT NULL AND `reverses_id` IS NULL
      AND `reason` IS NOT NULL AND CHAR_LENGTH(TRIM(`reason`)) > 0 AND `opening_material_id` IS NULL
      AND `operation_request_id` IS NOT NULL AND `created_by` IS NOT NULL)
  OR (`kind` = 'stock_opname' AND `qty` IS NULL
      AND `counted_stock` IS NOT NULL AND `counted_stock` >= 0 AND `counted_stock` <= 99999999.99
      AND `system_stock` IS NOT NULL AND `system_stock` >= 0 AND `system_stock` <= 99999999.99
      AND `reverses_id` IS NULL AND `replaces_id` IS NULL AND `opening_material_id` IS NULL AND `created_by` IS NOT NULL));

ALTER TABLE `material_movements` ADD CONSTRAINT `ck_mm_source` CHECK (
     (`type` IN ('saldo_awal','stok_masuk','pembalik_stok_masuk','koreksi_stok_masuk','stock_opname')
      AND `adjustment_id` IS NOT NULL AND `receipt_id` IS NULL AND `po_item_id` IS NULL)
  OR (`type` IN ('penerimaan','pembalik_penerimaan','koreksi_penerimaan')
      AND `receipt_id` IS NOT NULL AND `po_item_id` IS NOT NULL AND `adjustment_id` IS NULL));

ALTER TABLE `material_movements` ADD CONSTRAINT `ck_mm_sign` CHECK (
     (`type` IN ('saldo_awal','stok_masuk','penerimaan') AND `qty_change` > 0)
  OR (`type` IN ('pembalik_stok_masuk','pembalik_penerimaan') AND `qty_change` < 0)
  OR (`type` IN ('koreksi_stok_masuk','stock_opname','koreksi_penerimaan') AND `qty_change` <> 0));

ALTER TABLE `material_movements` ADD CONSTRAINT `ck_mm_balance` CHECK (`stock_after` = `stock_before` + `qty_change`
  AND `stock_before` >= 0 AND `stock_before` <= 99999999.99
  AND `stock_after` >= 0 AND `stock_after` <= 99999999.99);

ALTER TABLE `material_movements` ADD CONSTRAINT `ck_mm_actor` CHECK (`type` = 'saldo_awal' OR `created_by` IS NOT NULL);

-- ─── Saldo awal (M-7; Errata E1 B.2) ──────────────────────────────────────────────────────────────────────────────────
-- Satu dokumen saldo_awal per bahan (qty = stok saat ini, termasuk 0); mutasi hanya bila stok > 0.
-- raw_materials TIDAK diubah. Pada instalasi baru (tabel kosong) kedua pernyataan tidak menyisipkan apa pun; seed
-- membuat saldo awal bahan seed lewat createOpeningBalance. Eksekusi ulang ditolak UNIQUE uq_sa_opening/uq_mm_adjustment.

INSERT INTO `stock_adjustments` (`material_id`, `kind`, `qty`, `opening_material_id`, `created_by`, `created_at`)
  SELECT `material_id`, 'saldo_awal', `stock`, `material_id`, NULL, CURRENT_TIMESTAMP(3)
  FROM `raw_materials` ORDER BY `material_id`;

INSERT INTO `material_movements` (`material_id`, `type`, `qty_change`, `stock_before`, `stock_after`, `adjustment_id`, `created_by`, `created_at`)
  SELECT sa.`material_id`, 'saldo_awal', sa.`qty`, 0, sa.`qty`, sa.`adjustment_id`, NULL, sa.`created_at`
  FROM `stock_adjustments` sa WHERE sa.`kind` = 'saldo_awal' AND sa.`qty` > 0 ORDER BY sa.`material_id`;
