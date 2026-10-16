// pages/dev/ShowcaseSection.jsx
// Judul seksi di /dev/design (dipakai DesignSystemPage & LayoutShowcase)

export default function ShowcaseSection({ title, children }) {
  return (
    <section>
      <h2 className="font-display text-xl text-cocoa mb-4">{title}</h2>
      {children}
    </section>
  );
}
