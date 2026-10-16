// utils/cakeVisual.js
// FR-10 · C-11 — tampilan preview kue & ikon opsi dari nama opsi (fungsi murni)
// Opsi dikelola admin (AD-06) sehingga dicocokkan lewat kata kunci; tanpa kecocokan → tampilan bawaan.

import {
  CAKE_SHAPE_VISUALS, DEFAULT_CAKE_SHAPE, CAKE_FLAVOR_COLORS, DEFAULT_CAKE_FLAVOR_COLOR,
  CAKE_CREAM_VISUALS, DEFAULT_CAKE_CREAM, CUSTOM_OPTION_GROUP, WRITING_COLORS,
} from '../constants/customCake';

const matchByName = (list, name) => {
  const lower = String(name ?? '').toLowerCase();
  return list.find((v) => lower.includes(v.keyword));
};

export const cakeShapeOf = (option) => matchByName(CAKE_SHAPE_VISUALS, option?.name)?.shape ?? DEFAULT_CAKE_SHAPE;
export const flavorColorOf = (option) => matchByName(CAKE_FLAVOR_COLORS, option?.name)?.color ?? DEFAULT_CAKE_FLAVOR_COLOR;
export const creamVisualOf = (option) => matchByName(CAKE_CREAM_VISUALS, option?.name) ?? DEFAULT_CAKE_CREAM;
export const writingHexOf = (colorName) => WRITING_COLORS.find((c) => c.name === colorName)?.hex ?? WRITING_COLORS[0].hex;

/**
 * Skala preview menurut urutan opsi ukuran (ukuran pertama terkecil).
 * @returns {number} 0.78 – 1
 */
export function sizeScaleOf(option, sizeOptions) {
  const index = sizeOptions.findIndex((o) => o.option_id === option?.option_id);
  if (index === -1 || sizeOptions.length < 2) return 0.9;
  return 0.78 + (0.22 * index) / (sizeOptions.length - 1);
}

/**
 * Model tampilan preview dari opsi terpilih.
 * @param {object[]} selectedOptions — opsi terpilih (berbagai kelompok)
 * @param {object} groupedOptions — opsi aktif per kelompok
 */
export function buildCakeVisual(selectedOptions, groupedOptions, { writingText, writingColor }) {
  const pick = (group) => selectedOptions.find((o) => o.option_group === group);
  return {
    shape: cakeShapeOf(pick(CUSTOM_OPTION_GROUP.BENTUK)),
    scale: sizeScaleOf(pick(CUSTOM_OPTION_GROUP.UKURAN), groupedOptions[CUSTOM_OPTION_GROUP.UKURAN] ?? []),
    sponge: flavorColorOf(pick(CUSTOM_OPTION_GROUP.RASA)),
    cream: creamVisualOf(pick(CUSTOM_OPTION_GROUP.KRIM_TOPPING)),
    writing: String(writingText ?? '').trim(),
    writingHex: writingHexOf(writingColor),
  };
}
