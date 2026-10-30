// tests/unit/mock-env-loader.mjs
// Hook load Node ESM khusus uji mode mock: di Vite `import.meta.env` disuntik saat build, di Node tidak ada. Hook ini
// mengisi `import.meta.env.VITE_USE_MOCK = 'true'` HANYA untuk src/services/apiClient.js agar uji melewati jalur
// mode mock yang asli (apiClient → runMockRequest → mockHandler). Tanpa dependensi baru.

const TARGET = '/src/services/apiClient.js';

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!url.endsWith(TARGET)) return result;
  const source = `import.meta.env = { VITE_USE_MOCK: 'true' };\n${String(result.source)}`;
  return { ...result, source, shortCircuit: true };
}
