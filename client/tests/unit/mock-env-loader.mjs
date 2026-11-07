// tests/unit/mock-env-loader.mjs
// Hook load Node ESM khusus uji mode mock: di Vite `import.meta.env` disuntik saat build, di Node tidak ada. Hook ini
// mengisi `import.meta.env.VITE_USE_MOCK = 'true'` HANYA untuk src/services/apiClient.js (dan constants/dataMode.js) agar uji melewati jalur
// mode mock yang asli (apiClient → runMockRequest → mockHandler). Tanpa dependensi baru.

// Step 6.6 (CP3): constants/dataMode.js juga membaca VITE_USE_MOCK (namespace penyimpanan keranjang per mode)
const TARGETS = ['/src/services/apiClient.js', '/src/constants/dataMode.js'];

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!TARGETS.some((target) => url.endsWith(target))) return result;
  const source = `import.meta.env = { VITE_USE_MOCK: 'true' };\n${String(result.source)}`;
  return { ...result, source, shortCircuit: true };
}
