-- CR-04b · Step 6.9 · FR-45, FR-46 — Manufacturing (Draft 0.8.3 §8, §12.3; SPEC bagian 8 & 13).
-- 5 tabel baru (39 → 44): work_orders, work_order_recipes, material_issues, material_issue_lines, production_outputs;
-- perubahan aditif material_movements: kolom issue_id + FK RESTRICT + UNIQUE (issue_id, material_id), tiga jenis mutasi
-- pengeluaran, CHECK ck_mm_source & ck_mm_sign diganti (data CR-04a memenuhi CHECK baru karena issue_id NULL).
-- Semua FK ON DELETE RESTRICT ON UPDATE RESTRICT. Tanpa perubahan data; stok bahan tidak berubah.
-- DDL tabel/indeks/FK dihasilkan `prisma migrate diff` dari schema.prisma; CHECK ditambahkan sesuai Draft §12.3.

-- AlterTable
ALTER TABLE `material_movements` ADD COLUMN `issue_id` BIGINT NULL,
    MODIFY `type` ENUM('saldo_awal', 'stok_masuk', 'pembalik_stok_masuk', 'koreksi_stok_masuk', 'stock_opname', 'penerimaan', 'pembalik_penerimaan', 'koreksi_penerimaan', 'pengeluaran_produksi', 'pembalik_pengeluaran', 'koreksi_pengeluaran') NOT NULL;

-- CreateTable
CREATE TABLE `work_orders` (
    `wo_id` BIGINT NOT NULL AUTO_INCREMENT,
    `wo_number` VARCHAR(20) NOT NULL,
    `product_id` BIGINT NOT NULL,
    `production_date` DATE NOT NULL,
    `qty_planned` INTEGER NOT NULL,
    `status` ENUM('draft', 'diproses', 'selesai', 'dibatalkan') NOT NULL DEFAULT 'draft',
    `note` VARCHAR(255) NULL,
    `recipe_snapshot_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `created_by` BIGINT NOT NULL,
    `created_request_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uq_wo_number`(`wo_number`),
    UNIQUE INDEX `uq_wo_req`(`created_request_id`),
    INDEX `ix_wo_product`(`product_id`),
    INDEX `ix_wo_status`(`status`),
    INDEX `ix_wo_date`(`production_date`),
    PRIMARY KEY (`wo_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `work_order_recipes` (
    `wo_id` BIGINT NOT NULL,
    `material_id` BIGINT NOT NULL,
    `qty_per_unit` DECIMAL(10, 3) NOT NULL,

    INDEX `ix_wor_material`(`material_id`),
    PRIMARY KEY (`wo_id`, `material_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `material_issues` (
    `issue_id` BIGINT NOT NULL AUTO_INCREMENT,
    `wo_id` BIGINT NOT NULL,
    `kind` ENUM('normal', 'pembalik', 'pengganti') NOT NULL,
    `reverses_id` BIGINT NULL,
    `replaces_id` BIGINT NULL,
    `reason` VARCHAR(255) NULL,
    `operation_request_id` CHAR(36) NOT NULL,
    `created_by` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_mi_reverses`(`reverses_id`),
    UNIQUE INDEX `uq_mi_replaces`(`replaces_id`),
    INDEX `ix_mi_wo`(`wo_id`),
    INDEX `ix_mi_opreq`(`operation_request_id`),
    INDEX `ix_mi_created`(`created_at`),
    PRIMARY KEY (`issue_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `material_issue_lines` (
    `line_id` BIGINT NOT NULL AUTO_INCREMENT,
    `issue_id` BIGINT NOT NULL,
    `material_id` BIGINT NOT NULL,
    `qty` DECIMAL(10, 2) NOT NULL,

    INDEX `ix_mil_material`(`material_id`),
    UNIQUE INDEX `uq_mil`(`issue_id`, `material_id`),
    PRIMARY KEY (`line_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `production_outputs` (
    `output_id` BIGINT NOT NULL AUTO_INCREMENT,
    `wo_id` BIGINT NOT NULL,
    `kind` ENUM('normal', 'pembalik', 'pengganti') NOT NULL,
    `qty_output` INTEGER NOT NULL,
    `normal_wo_id` BIGINT NULL,
    `reverses_id` BIGINT NULL,
    `replaces_id` BIGINT NULL,
    `reason` VARCHAR(255) NULL,
    `operation_request_id` CHAR(36) NOT NULL,
    `created_by` BIGINT NOT NULL,
    `recorded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_po_normal`(`normal_wo_id`),
    UNIQUE INDEX `uq_po_reverses`(`reverses_id`),
    UNIQUE INDEX `uq_po_replaces`(`replaces_id`),
    INDEX `ix_out_wo`(`wo_id`),
    INDEX `ix_out_recorded`(`recorded_at`),
    INDEX `ix_out_opreq`(`operation_request_id`),
    PRIMARY KEY (`output_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `uq_mm_issue_material` ON `material_movements`(`issue_id`, `material_id`);

-- AddForeignKey
ALTER TABLE `material_movements` ADD CONSTRAINT `material_movements_issue_id_fkey` FOREIGN KEY (`issue_id`) REFERENCES `material_issues`(`issue_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `work_orders` ADD CONSTRAINT `work_orders_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`product_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `work_orders` ADD CONSTRAINT `work_orders_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `work_orders` ADD CONSTRAINT `work_orders_created_request_id_fkey` FOREIGN KEY (`created_request_id`) REFERENCES `operation_requests`(`request_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `work_order_recipes` ADD CONSTRAINT `work_order_recipes_wo_id_fkey` FOREIGN KEY (`wo_id`) REFERENCES `work_orders`(`wo_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `work_order_recipes` ADD CONSTRAINT `work_order_recipes_material_id_fkey` FOREIGN KEY (`material_id`) REFERENCES `raw_materials`(`material_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `material_issues` ADD CONSTRAINT `material_issues_wo_id_fkey` FOREIGN KEY (`wo_id`) REFERENCES `work_orders`(`wo_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `material_issues` ADD CONSTRAINT `material_issues_reverses_id_fkey` FOREIGN KEY (`reverses_id`) REFERENCES `material_issues`(`issue_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `material_issues` ADD CONSTRAINT `material_issues_replaces_id_fkey` FOREIGN KEY (`replaces_id`) REFERENCES `material_issues`(`issue_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `material_issues` ADD CONSTRAINT `material_issues_operation_request_id_fkey` FOREIGN KEY (`operation_request_id`) REFERENCES `operation_requests`(`request_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `material_issues` ADD CONSTRAINT `material_issues_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `material_issue_lines` ADD CONSTRAINT `material_issue_lines_issue_id_fkey` FOREIGN KEY (`issue_id`) REFERENCES `material_issues`(`issue_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `material_issue_lines` ADD CONSTRAINT `material_issue_lines_material_id_fkey` FOREIGN KEY (`material_id`) REFERENCES `raw_materials`(`material_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `production_outputs` ADD CONSTRAINT `production_outputs_wo_id_fkey` FOREIGN KEY (`wo_id`) REFERENCES `work_orders`(`wo_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `production_outputs` ADD CONSTRAINT `production_outputs_normal_wo_id_fkey` FOREIGN KEY (`normal_wo_id`) REFERENCES `work_orders`(`wo_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `production_outputs` ADD CONSTRAINT `production_outputs_reverses_id_fkey` FOREIGN KEY (`reverses_id`) REFERENCES `production_outputs`(`output_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `production_outputs` ADD CONSTRAINT `production_outputs_replaces_id_fkey` FOREIGN KEY (`replaces_id`) REFERENCES `production_outputs`(`output_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `production_outputs` ADD CONSTRAINT `production_outputs_operation_request_id_fkey` FOREIGN KEY (`operation_request_id`) REFERENCES `operation_requests`(`request_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `production_outputs` ADD CONSTRAINT `production_outputs_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ─── CHECK constraints (pola anti-UNKNOWN, Draft §12.1 – §12.3) ───────────────────────────────────────────────────────

ALTER TABLE `work_orders` ADD CONSTRAINT `ck_wo_qty` CHECK (`qty_planned` BETWEEN 1 AND 10000);

ALTER TABLE `work_orders` ADD CONSTRAINT `ck_wo_status` CHECK (
     (`status` = 'draft' AND `started_at` IS NULL AND `recipe_snapshot_at` IS NULL
      AND `completed_at` IS NULL AND `cancelled_at` IS NULL)
  OR (`status` = 'diproses' AND `started_at` IS NOT NULL AND `recipe_snapshot_at` IS NOT NULL
      AND `completed_at` IS NULL AND `cancelled_at` IS NULL)
  OR (`status` = 'selesai' AND `started_at` IS NOT NULL AND `recipe_snapshot_at` IS NOT NULL
      AND `completed_at` IS NOT NULL AND `cancelled_at` IS NULL)
  OR (`status` = 'dibatalkan' AND `completed_at` IS NULL AND `cancelled_at` IS NOT NULL
      AND ((`started_at` IS NULL AND `recipe_snapshot_at` IS NULL)
        OR (`started_at` IS NOT NULL AND `recipe_snapshot_at` IS NOT NULL))));

ALTER TABLE `work_order_recipes` ADD CONSTRAINT `ck_wor_qty` CHECK (`qty_per_unit` > 0 AND `qty_per_unit` <= 9999999.999);

ALTER TABLE `material_issues` ADD CONSTRAINT `ck_mi_kind` CHECK (
     (`kind` = 'normal' AND `reverses_id` IS NULL AND `replaces_id` IS NULL AND `reason` IS NULL)
  OR (`kind` = 'pembalik' AND `reverses_id` IS NOT NULL AND `replaces_id` IS NULL
      AND `reason` IS NOT NULL AND CHAR_LENGTH(TRIM(`reason`)) > 0)
  OR (`kind` = 'pengganti' AND `replaces_id` IS NOT NULL AND `reverses_id` IS NULL
      AND `reason` IS NOT NULL AND CHAR_LENGTH(TRIM(`reason`)) > 0));

ALTER TABLE `material_issue_lines` ADD CONSTRAINT `ck_mil_qty` CHECK (`qty` > 0 AND `qty` <= 99999999.99);

ALTER TABLE `production_outputs` ADD CONSTRAINT `ck_out_kind` CHECK (
     (`kind` = 'normal' AND `qty_output` BETWEEN 0 AND 10000
      AND `normal_wo_id` IS NOT NULL AND `normal_wo_id` = `wo_id`
      AND `reverses_id` IS NULL AND `replaces_id` IS NULL AND `reason` IS NULL)
  OR (`kind` = 'pembalik' AND `qty_output` BETWEEN 1 AND 10000 AND `normal_wo_id` IS NULL
      AND `reverses_id` IS NOT NULL AND `replaces_id` IS NULL
      AND `reason` IS NOT NULL AND CHAR_LENGTH(TRIM(`reason`)) > 0)
  OR (`kind` = 'pengganti' AND `qty_output` BETWEEN 1 AND 10000 AND `normal_wo_id` IS NULL
      AND `replaces_id` IS NOT NULL AND `reverses_id` IS NULL
      AND `reason` IS NOT NULL AND CHAR_LENGTH(TRIM(`reason`)) > 0));

-- material_movements: sumber & tanda mencakup pengeluaran (ck_mm_balance & ck_mm_actor tetap)
ALTER TABLE `material_movements` DROP CHECK `ck_mm_source`;
ALTER TABLE `material_movements` DROP CHECK `ck_mm_sign`;

ALTER TABLE `material_movements` ADD CONSTRAINT `ck_mm_source` CHECK (
     (`type` IN ('saldo_awal','stok_masuk','pembalik_stok_masuk','koreksi_stok_masuk','stock_opname')
      AND `adjustment_id` IS NOT NULL AND `receipt_id` IS NULL AND `po_item_id` IS NULL AND `issue_id` IS NULL)
  OR (`type` IN ('penerimaan','pembalik_penerimaan','koreksi_penerimaan')
      AND `receipt_id` IS NOT NULL AND `po_item_id` IS NOT NULL AND `adjustment_id` IS NULL AND `issue_id` IS NULL)
  OR (`type` IN ('pengeluaran_produksi','pembalik_pengeluaran','koreksi_pengeluaran')
      AND `issue_id` IS NOT NULL AND `adjustment_id` IS NULL AND `receipt_id` IS NULL AND `po_item_id` IS NULL));

ALTER TABLE `material_movements` ADD CONSTRAINT `ck_mm_sign` CHECK (
     (`type` IN ('saldo_awal','stok_masuk','penerimaan','pembalik_pengeluaran') AND `qty_change` > 0)
  OR (`type` IN ('pembalik_stok_masuk','pembalik_penerimaan','pengeluaran_produksi') AND `qty_change` < 0)
  OR (`type` IN ('koreksi_stok_masuk','stock_opname','koreksi_penerimaan','koreksi_pengeluaran') AND `qty_change` <> 0));
