// hooks/useCountdown.js
// Step 3 · Authentication
// Hitung mundur per detik (dipakai untuk kirim ulang OTP C-04)

import { useState, useEffect, useRef, useCallback } from 'react';

/** @returns {[number, (seconds:number) => void]} [sisa detik, fungsi mulai] */
export default function useCountdown() {
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const start = useCallback((seconds) => {
    setCountdown(seconds);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, []);

  return [countdown, start];
}
