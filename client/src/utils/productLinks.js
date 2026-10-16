// utils/productLinks.js
// Step 4 · Tujuan tautan kartu produk

import { AVAILABILITY_TYPE } from '../constants/product';
import { CUSTOMER_ROUTES, buildPath } from '../constants/routes';

/** Custom cake dibuka lewat Custom Cake Builder (C-11); produk lain ke Detail Produk (C-09) */
export function productHref(product) {
  return product.availability_type === AVAILABILITY_TYPE.CUSTOM
    ? CUSTOMER_ROUTES.CUSTOM_CAKE
    : buildPath(CUSTOMER_ROUTES.PRODUK_DETAIL, { id: product.product_id });
}
