// pages/customer/CustomCakePage.jsx
// C-11 · Custom Cake Builder (6 langkah)
// Step 2 · Placeholder — Stepper ditampilkan sebagai preview komponen

import Stepper from '../../components/ui/Stepper';

const STEPS = ['Ukuran', 'Bentuk', 'Rasa', 'Krim & Topping', 'Tulisan', 'Tanggal'];

export default function CustomCakePage() {
  return (
    <div className="px-5 py-6 space-y-6">
      <p className="text-xs font-semibold text-primary tracking-widest uppercase">C-11</p>
      <h1 className="font-display text-3xl text-cocoa">Custom Cake Builder</h1>
      <p className="text-sm text-cocoa/60">6 langkah · Tanggal ≥ H+3 (BR-02)</p>

      {/* Preview Stepper */}
      <Stepper steps={STEPS} currentStep={2} />

      <p className="text-xs text-cocoa/40 text-center">(Konten tiap langkah diimplementasi di Step 5.2)</p>
    </div>
  );
}
