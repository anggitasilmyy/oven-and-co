// components/admin/AdminAvatar.jsx
// FR-26 · Avatar inisial nama pengguna admin (dipakai AdminSidebar & AdminTopbar)

/** Ambil maksimal 2 huruf awal dari nama */
function getInitials(name) {
  return name ? name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '?';
}

// Kelas sama persis dengan markup AdminLayout sebelum dipecah
const VARIANTS = {
  // Di sidebar gelap
  dark: { box: 'w-8 h-8 rounded-full bg-primary/60 flex items-center justify-center shrink-0', text: 'text-cream' },
  // Di topbar terang
  light: { box: 'w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center', text: 'text-primary' },
};

export default function AdminAvatar({ name, variant = 'light' }) {
  const { box, text } = VARIANTS[variant] ?? VARIANTS.light;
  return (
    <div className={box}>
      <span className={`text-xs font-bold ${text}`}>{getInitials(name)}</span>
    </div>
  );
}
