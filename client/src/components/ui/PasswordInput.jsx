// components/ui/PasswordInput.jsx
// Step 3 · Authentication
// Input kata sandi dengan tombol tampil/sembunyi (dipakai C-02, C-03, C-04, AD-01)

import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import Input from './Input';

/**
 * @param {string} showLabel — aria-label tombol saat sandi tersembunyi
 * @param {string} hideLabel — aria-label tombol saat sandi terlihat
 */
export default function PasswordInput({
  showLabel = 'Tampilkan kata sandi',
  hideLabel = 'Sembunyikan kata sandi',
  ...props
}) {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      type={visible ? 'text' : 'password'}
      leftIcon={<Lock size={18} />}
      rightIcon={
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? hideLabel : showLabel}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center -mr-3"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      }
      {...props}
    />
  );
}
