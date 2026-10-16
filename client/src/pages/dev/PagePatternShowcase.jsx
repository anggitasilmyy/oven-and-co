// pages/dev/PagePatternShowcase.jsx
// Step 2.5 (PR B) · Pola halaman responsif yang dipakai di aplikasi (dokumentasi /dev/design)

import Section from './ShowcaseSection';
import PlaceholderPanel from '../../components/layout/PlaceholderPanel';
import TableScroll from '../../components/layout/TableScroll';

const PATTERNS = [
  { pattern: 'PageContainer + PageHeader', mobile: 'Satu kolom, padding 20 px', desktop: 'Kontainer maks. 1280 px, padding 40 px', screens: 'C-05, C-06, C-08, C-17' },
  { pattern: 'PageContainer variant="narrow"', mobile: 'Satu kolom', desktop: 'Satu kolom maks. 720 px', screens: 'C-10, C-16, C-18, C-19, C-24' },
  { pattern: 'FocusPageGrid + ActionBar', mobile: 'ActionBar menempel di bawah', desktop: 'Konten kiri + kartu aksi sticky kanan', screens: 'C-09, C-11 – C-15' },
  { pattern: 'AccountLayout', mobile: 'Konten saja (perilaku lama)', desktop: 'Sidebar menu Akun kiri + konten kanan', screens: 'C-20 – C-23' },
  { pattern: 'AuthSplitLayout', mobile: 'Form satu kolom', desktop: 'Panel brand kiri + form kanan', screens: 'C-02 – C-04, AD-01' },
  { pattern: 'AdminLayout + PageHeader', mobile: 'Sidebar menjadi drawer (< 1024)', desktop: 'Sidebar tetap, konten maks. 1280 px', screens: 'AD-02 – AD-11' },
  { pattern: 'Onboarding hero', mobile: 'Slide satu kolom', desktop: 'Hero dua kolom (visual + konten)', screens: 'C-01' },
];

export default function PagePatternShowcase() {
  return (
    <>
      <Section title="🗺️ Pola halaman per layar">
        <div className="card p-0">
          <TableScroll label="Pola halaman responsif" minWidth="min-w-[640px]">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-cocoa/70 border-b border-beige">
              <tr>
                <th className="py-3 px-4 font-semibold">Pola</th>
                <th className="py-3 px-4 font-semibold">&lt; 1024 px</th>
                <th className="py-3 px-4 font-semibold">≥ 1024 px</th>
                <th className="py-3 px-4 font-semibold">Layar</th>
              </tr>
            </thead>
            <tbody>
              {PATTERNS.map((p) => (
                <tr key={p.pattern} className="border-b border-beige/60 last:border-0 align-top">
                  <td className="py-3 px-4 font-mono text-xs text-primary">{p.pattern}</td>
                  <td className="py-3 px-4">{p.mobile}</td>
                  <td className="py-3 px-4">{p.desktop}</td>
                  <td className="py-3 px-4 whitespace-nowrap">{p.screens}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableScroll>
        </div>
      </Section>

      <Section title="🚧 PlaceholderPanel">
        <div className="space-y-3">
          <PlaceholderPanel step="Step 5.1" refs="FR-06">
            Penanda area yang belum diimplementasi — dipakai halaman placeholder, bukan data dummy.
          </PlaceholderPanel>
          <PlaceholderPanel step="Step 5.3" compact>
            Versi ringkas (compact) untuk di dalam ActionBar.
          </PlaceholderPanel>
        </div>
      </Section>
    </>
  );
}
