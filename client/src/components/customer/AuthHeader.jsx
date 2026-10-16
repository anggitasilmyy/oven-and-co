// components/customer/AuthHeader.jsx
// Step 3 · Authentication
// C-02 · C-03 · C-04 — judul & subjudul layar autentikasi pelanggan

export default function AuthHeader({ title, subtitle, className = 'mb-8' }) {
  return (
    <div className={className}>
      <h1 className="font-display text-3xl text-cocoa mb-1">{title}</h1>
      <p className="text-sm text-cocoa/60">{subtitle}</p>
    </div>
  );
}
