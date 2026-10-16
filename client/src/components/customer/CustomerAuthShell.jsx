// components/customer/CustomerAuthShell.jsx
// Step 2.5 (PR B) · C-02 Masuk · C-03 Daftar · C-04 Lupa Sandi
// < lg : form satu kolom (logo sudah ada di header FocusLayout)
// ≥ lg : split-screen — panel brand kiri, form kanan (AuthSplitLayout)

import AuthSplitLayout from '../layout/AuthSplitLayout';
import AuthBrandHighlights from './AuthBrandHighlights';

export default function CustomerAuthShell({ children }) {
  return (
    <AuthSplitLayout className="flex-1" showMobileBrand={false} brandExtra={<AuthBrandHighlights />}>
      {children}
    </AuthSplitLayout>
  );
}
