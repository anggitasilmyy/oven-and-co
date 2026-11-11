-- CreateTable
CREATE TABLE `product_materials` (
    `product_id` BIGINT NOT NULL,
    `material_id` BIGINT NOT NULL,
    `qty_per_unit` DECIMAL(10, 3) NOT NULL,

    PRIMARY KEY (`product_id`, `material_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `product_materials` ADD CONSTRAINT `product_materials_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`product_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_materials` ADD CONSTRAINT `product_materials_material_id_fkey` FOREIGN KEY (`material_id`) REFERENCES `raw_materials`(`material_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

