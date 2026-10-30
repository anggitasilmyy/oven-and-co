// tests/unit/resolve-extensionless.mjs
// Hook resolve Node ESM: impor relatif tanpa ekstensi (gaya Vite, mis. '../../constants/cart') dicoba ulang
// dengan '.js'. Hanya untuk uji fungsi murni di Node tanpa dependensi baru (Vitest belum terpasang).

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
    if (isRelative && !specifier.endsWith('.js') && error.code === 'ERR_MODULE_NOT_FOUND') {
      return nextResolve(`${specifier}.js`, context);
    }
    throw error;
  }
}
