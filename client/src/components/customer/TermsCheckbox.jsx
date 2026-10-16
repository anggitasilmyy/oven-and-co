// components/customer/TermsCheckbox.jsx
// FR-01 · C-03 Daftar — checkbox persetujuan S&K (wajib, SPEC §6)

export default function TermsCheckbox({ checked, onChange }) {
  return (
    <label
      htmlFor="daftar-agree-terms"
      className="flex items-start gap-3 cursor-pointer select-none"
    >
      <input
        id="daftar-agree-terms"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-[18px] h-[18px] accent-primary rounded shrink-0"
        aria-required="true"
      />
      <span className="text-sm text-cocoa/70 leading-snug">
        Saya menyetujui{' '}
        <span className="text-primary font-semibold">Syarat &amp; Ketentuan</span> dan{' '}
        <span className="text-primary font-semibold">Kebijakan Privasi</span> Oven &amp; Co.
      </span>
    </label>
  );
}
