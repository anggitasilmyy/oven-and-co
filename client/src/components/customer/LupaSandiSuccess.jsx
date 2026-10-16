// components/customer/LupaSandiSuccess.jsx
// FR-03 · C-04 Lupa Kata Sandi — langkah 3: konfirmasi sandi berhasil diperbarui

import Button from '../ui/Button';

export default function LupaSandiSuccess({ onLogin }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-5 py-10 text-center">
      <div className="text-6xl mb-6" aria-hidden="true">✅</div>
      <h1 className="font-display text-2xl text-cocoa mb-2">Kata Sandi Diperbarui!</h1>
      <p className="text-sm text-cocoa/60 mb-8">
        Silakan masuk dengan kata sandi baru kamu.
      </p>
      <Button id="lupa-sandi-ke-masuk-btn" fullWidth onClick={onLogin}>
        Masuk Sekarang
      </Button>
    </div>
  );
}
