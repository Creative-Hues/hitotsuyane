import { describe, expect, it } from 'vitest';
import { nameLabelColors, UNKNOWN_LABEL_COLOR } from './labelColor';

describe('名前ラベルの色', () => {
  it('暗い色の上は白い文字', () => {
    expect(nameLabelColors('#1f3a93')).toEqual({ background: '#1f3a93', text: '#ffffff' });
    expect(nameLabelColors('#000000').text).toBe('#ffffff');
  });

  it('明るい色の上は黒い文字', () => {
    expect(nameLabelColors('#ffeb3b')).toEqual({ background: '#ffeb3b', text: '#1a1a1a' });
    expect(nameLabelColors('#ffffff').text).toBe('#1a1a1a');
    expect(nameLabelColors('#a8e6cf').text).toBe('#1a1a1a');
  });

  it('3桁の色と大文字も読める', () => {
    expect(nameLabelColors('#FFF').text).toBe('#1a1a1a');
    expect(nameLabelColors('#00f').text).toBe('#ffffff');
  });

  it('「わからない」(null)は灰色', () => {
    expect(nameLabelColors(null).background).toBe(UNKNOWN_LABEL_COLOR);
  });

  it('形が正しくない色は灰色にする', () => {
    expect(nameLabelColors('red').background).toBe(UNKNOWN_LABEL_COLOR);
    expect(nameLabelColors('#12345').background).toBe(UNKNOWN_LABEL_COLOR);
    expect(nameLabelColors('').background).toBe(UNKNOWN_LABEL_COLOR);
  });
});
