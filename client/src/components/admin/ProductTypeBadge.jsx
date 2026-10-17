// components/admin/ProductTypeBadge.jsx
// Step 5.7 · FR-30 · AD-06 — badge tipe produk + lead time (Ready / Pre-order H-n / Custom H-n)

import Badge from '../ui/Badge';
import { getProductTypeLabel } from '../../utils/businessRules';
import { AVAILABILITY_BADGE } from '../../constants/product';

/** @param {{availability_type, lead_time_days}} row */
export default function ProductTypeBadge({ row }) {
  return <Badge variant={AVAILABILITY_BADGE[row.availability_type]?.variant}>{getProductTypeLabel(row)}</Badge>;
}
