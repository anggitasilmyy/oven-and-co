// hooks/useDebounce.js
// Step 4 · Menunda nilai (mis. teks pencarian) agar service tidak dipanggil setiap ketukan

import { useEffect, useState } from 'react';

export default function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
