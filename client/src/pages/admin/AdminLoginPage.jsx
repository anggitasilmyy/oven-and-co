// pages/admin/AdminLoginPage.jsx
// AD-01 · Login Admin (split screen)
// Step 2 · Placeholder

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen bg-cocoa flex">
      {/* Panel kiri — branding */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-12">
        <div className="text-center text-cream space-y-3">
          <p className="text-xs font-semibold tracking-widest uppercase text-cream/50">AD-01</p>
          <h1 className="font-display text-5xl">Oven &amp; Co.</h1>
          <p className="text-cream/60 italic">Freshly Baked, Made With Care</p>
        </div>
      </div>
      {/* Panel kanan — form login */}
      <div className="flex-1 flex items-center justify-center p-8 bg-cream">
        <div className="w-full max-w-sm text-center space-y-3">
          <p className="text-xs font-semibold text-primary tracking-widest uppercase">AD-01</p>
          <h2 className="font-display text-3xl text-cocoa">Masuk Admin</h2>
          <p className="text-sm text-cocoa/60">FR-26 · Split screen login</p>
        </div>
      </div>
    </div>
  );
}
