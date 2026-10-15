// pages/customer/OnboardingPage.jsx
// C-01 · Splash & Onboarding (3 slide, kunjungan pertama)
// Step 2 · Placeholder

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-5">
      <div className="text-center space-y-3">
        <p className="text-xs font-semibold text-primary tracking-widest uppercase">C-01</p>
        <h1 className="font-display text-3xl text-cocoa">Splash &amp; Onboarding</h1>
        <p className="text-sm text-cocoa/60">3 slide · Hanya tampil saat kunjungan pertama</p>
      </div>
    </div>
  );
}
