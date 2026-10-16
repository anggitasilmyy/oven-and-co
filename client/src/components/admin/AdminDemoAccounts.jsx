// components/admin/AdminDemoAccounts.jsx
// FR-26 · AD-01 Login Admin — info akun demo di panel brand (dipindah dari AdminBrandPanel)

export default function AdminDemoAccounts() {
  return (
    <div className="text-left bg-white/10 rounded-2xl p-5 text-sm text-cream/85 space-y-2 max-w-xs">
      <p className="font-semibold text-cream mb-1">Akun Demo</p>
      <p>👤 Owner: <span className="font-mono">owner@demo.com</span></p>
      <p>👤 Staf: <span className="font-mono">staf@demo.com</span></p>
      <p className="text-cream/70">Sandi: <span className="font-mono">demo1234</span></p>
    </div>
  );
}
