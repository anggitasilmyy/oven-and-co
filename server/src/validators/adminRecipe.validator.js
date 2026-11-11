// validators/adminRecipe.validator.js
// CR-03 CP4 · FR-39 · UC-31 · SPEC §6 "Komposisi bahan" — bentuk body PUT /api/admin/products/:id/materials.
// Hanya memeriksa bentuk (objek JSON); isi `items` (bahan terdaftar, ganda, takaran string desimal, maks. 30 baris)
// divalidasi aturan murni recipeRules.validateRecipeItems di dalam transaksi, setelah master bahan dibaca.

const { z, parseOrThrow } = require('./zodHelpers');

const BODY_INVALID_TEXT = 'Data komposisi tidak valid.';
const recipeBodySchema = z.object({ items: z.unknown().optional() }, { error: BODY_INVALID_TEXT }); // items hilang → fieldErrors.items (aturan murni)

/** Body → `items` mentah (diteruskan apa adanya ke aturan murni) */
function validateRecipeBody(body) {
  return parseOrThrow(recipeBodySchema, body, () => BODY_INVALID_TEXT).items;
}

module.exports = { validateRecipeBody };
