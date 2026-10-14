// 名前ラベル(SPEC.md 5章)の色を決める。純粋関数。
// 背景はその人格の色。文字は、背景の上で読みやすい白か黒を選ぶ(明るい色の人格でも名前が読めるように)

/** 「わからない」のラベルの色(交代の集計の「わからない」と同じ灰色) */
export const UNKNOWN_LABEL_COLOR = '#9a9a9a';

const WHITE = '#ffffff';
const BLACK = '#1a1a1a';

/** 「#rgb」「#rrggbb」の色を [赤, 緑, 青](0〜255)にする。形が正しくなければ null */
function parseHexColor(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) {
    return null;
  }
  const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1];
  return [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16)) as [number, number, number];
}

/** 色の明るさ(相対輝度。0=黒〜1=白。WCAG の計算) */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linear = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** 2つの明るさの見分けやすさ(コントラスト比。1〜21) */
function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * 名前ラベルの背景と文字の色
 * @param color 人格の色。null(「わからない」)や、形が正しくない色のときは灰色にする
 */
export function nameLabelColors(color: string | null): { background: string; text: string } {
  const rgb = color === null ? null : parseHexColor(color);
  const background = rgb && color !== null ? color.trim() : UNKNOWN_LABEL_COLOR;
  const luminance = relativeLuminance(rgb ?? (parseHexColor(UNKNOWN_LABEL_COLOR) as [number, number, number]));
  const white = contrastRatio(luminance, 1);
  const black = contrastRatio(luminance, relativeLuminance([0x1a, 0x1a, 0x1a]));
  return { background, text: white >= black ? WHITE : BLACK };
}
