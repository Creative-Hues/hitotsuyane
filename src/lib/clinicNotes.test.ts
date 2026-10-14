import { describe, expect, it } from 'vitest';
import {
  UNKNOWN_CATEGORY_NAME,
  authorHeading,
  buildClinicView,
  buildClinicViewText,
  clinicViewTitle,
  deleteConfirmMessage,
  groupCommentsByNote,
  selectableAuthors,
  splitClinicNotes,
  validateClinicNoteCommentForm,
  validateClinicNoteForm,
} from './clinicNotes';
import type { Alter, ClinicNote, ClinicNoteCategory, ClinicNoteComment } from './types';

/** 2026年のローカル時刻を ISO 形式で作る(month は 1〜12) */
function iso(month: number, day: number, hour = 12): string {
  return new Date(2026, month - 1, day, hour).toISOString();
}

function alter(id: string, name: string, order: number, hidden = false): Alter {
  return {
    id,
    name,
    color: '#4a90d9',
    hidden,
    order,
    createdAt: '',
    reading: '',
    categoryId: null,
    age: '',
    gender: '',
    identify: '',
  };
}

function note(id: string, overrides: Partial<ClinicNote> = {}): ClinicNote {
  return { id, alterId: 'a', categoryId: 'health', body: id, createdAt: iso(9, 1), discussedAt: null, ...overrides };
}

function comment(id: string, noteId: string, overrides: Partial<ClinicNoteComment> = {}): ClinicNoteComment {
  return { id, noteId, alterId: 'b', body: id, createdAt: iso(9, 2), ...overrides };
}

const alterA = alter('a', '人格A', 1);
const alterB = alter('b', '人格B', 0);
const alterById = new Map([alterA, alterB].map((x) => [x.id, x]));
const categories: ClinicNoteCategory[] = [
  { id: 'health', name: '体調', order: 0, createdAt: '' },
  { id: 'sleep', name: '睡眠', order: 1, createdAt: '' },
];

describe('一覧の分け方と並び順(SPEC.md 8.2)', () => {
  it('まだ話していないものは書いた日時の古い順、話したものは話した日時の新しい順', () => {
    const { pending, discussed } = splitClinicNotes([
      note('p2', { createdAt: iso(9, 5) }),
      note('d1', { createdAt: iso(9, 1), discussedAt: iso(9, 10) }),
      note('p1', { createdAt: iso(9, 3) }),
      note('d2', { createdAt: iso(9, 2), discussedAt: iso(9, 20) }),
    ]);
    expect(pending.map((n) => n.id)).toEqual(['p1', 'p2']);
    expect(discussed.map((n) => n.id)).toEqual(['d2', 'd1']);
  });

  it('コメントはメモごとに分け、古い順に並べる', () => {
    const byNote = groupCommentsByNote([
      comment('c2', 'n1', { createdAt: iso(9, 3) }),
      comment('c1', 'n1', { createdAt: iso(9, 2) }),
      comment('x', 'n2'),
    ]);
    expect(byNote.get('n1')?.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(byNote.get('n2')?.map((c) => c.id)).toEqual(['x']);
    expect(byNote.get('n3')).toBeUndefined();
  });
});

describe('誰が書いたかの表示(SPEC.md 8.1・8.4)', () => {
  it('編集画面の上:「人格Aが書いたメモ」「人格Bが書いたコメント」、わからないときは「書いた人格:わからない」', () => {
    expect(authorHeading('a', 'メモ', alterById)).toEqual({
      alter: { name: '人格A', color: '#4a90d9' },
      text: '人格Aが書いたメモ',
    });
    expect(authorHeading('b', 'コメント', alterById).text).toBe('人格Bが書いたコメント');
    expect(authorHeading(null, 'メモ', alterById)).toEqual({ alter: null, text: '書いた人格:わからない' });
  });

  it('削除の確認文:書いた人格と、コメントの件数を入れる', () => {
    expect(deleteConfirmMessage('a', 'メモ', alterById)).toBe('人格Aが書いたメモを削除しますか?');
    expect(deleteConfirmMessage('a', 'メモ', alterById, 2)).toBe(
      '人格Aが書いたメモを削除しますか?コメント2件も一緒に削除されます。',
    );
    expect(deleteConfirmMessage(null, 'メモ', alterById, 1)).toBe(
      '書いた人格がわからないメモを削除しますか?コメント1件も一緒に削除されます。',
    );
    expect(deleteConfirmMessage('b', 'コメント', alterById)).toBe('人格Bが書いたコメントを削除しますか?');
    expect(deleteConfirmMessage(null, 'コメント', alterById)).toBe('書いた人格がわからないコメントを削除しますか?');
  });
});

describe('入力のチェック', () => {
  it('メモ:書いた人格・分類は選ばないと保存できず、内容が空ならエラー', () => {
    const base = { author: { alterId: 'a' }, categoryId: 'health', body: '頭が痛い' };
    expect(validateClinicNoteForm({ ...base, author: null })).toEqual({ ok: false, error: '書いた人格を選んでください' });
    expect(validateClinicNoteForm({ ...base, categoryId: null })).toEqual({ ok: false, error: '分類を選んでください' });
    expect(validateClinicNoteForm({ ...base, body: ' \n ' })).toEqual({ ok: false, error: '内容を入力してください' });
  });

  it('メモ:「わからない」も選べる。内容の前後の空白は取り除き、途中の改行は残す', () => {
    expect(validateClinicNoteForm({ author: { alterId: null }, categoryId: 'health', body: '\n 1行目\n2行目 \n' })).toEqual({
      ok: true,
      input: { alterId: null, categoryId: 'health', body: '1行目\n2行目' },
    });
  });

  it('コメント:書いた人格は選ばないと保存できず、内容が空ならエラー', () => {
    expect(validateClinicNoteCommentForm({ author: null, body: '私も' })).toEqual({
      ok: false,
      error: '書いた人格を選んでください',
    });
    expect(validateClinicNoteCommentForm({ author: { alterId: 'b' }, body: '' })).toEqual({
      ok: false,
      error: '内容を入力してください',
    });
    expect(validateClinicNoteCommentForm({ author: { alterId: 'b' }, body: ' 私も ' })).toEqual({
      ok: true,
      input: { alterId: 'b', body: '私も' },
    });
  });
});

describe('診察用の表示(SPEC.md 8.3)', () => {
  it('まだ話していないメモだけを、人格の並び順(わからないは最後)→ 分類の並び順 → 書いた順で並べる', () => {
    const groups = buildClinicView(
      [
        note('a-sleep', { alterId: 'a', categoryId: 'sleep' }),
        note('a-health-2', { alterId: 'a', createdAt: iso(9, 3) }),
        note('a-health-1', { alterId: 'a', createdAt: iso(9, 2) }),
        note('unknown', { alterId: null }),
        note('deleted-alter', { alterId: 'gone' }),
        note('b-done', { alterId: 'b', discussedAt: iso(9, 10) }),
        note('b', { alterId: 'b' }),
      ],
      [],
      [alterA, alterB],
      categories,
    );
    expect(
      groups.map((g) => [g.name, g.categories.map((c) => [c.name, c.notes.map((n) => n.note.id)])]),
    ).toEqual([
      ['人格B', [['体調', ['b']]]],
      [
        '人格A',
        [
          ['体調', ['a-health-1', 'a-health-2']],
          ['睡眠', ['a-sleep']],
        ],
      ],
      ['わからない', [['体調', ['unknown', 'deleted-alter']]]],
    ]);
  });

  it('非表示の人格のメモも、その名前で出す', () => {
    const groups = buildClinicView([note('n', { alterId: 'h' })], [], [alter('h', '人格C', 0, true)], categories);
    expect(groups.map((g) => g.name)).toEqual(['人格C']);
  });

  it('見つからない分類のメモは、分類の最後に「(不明な分類)」で出す', () => {
    const groups = buildClinicView([note('x', { categoryId: 'gone' }), note('h')], [], [alterA], categories);
    expect(groups[0].categories.map((c) => c.name)).toEqual(['体調', UNKNOWN_CATEGORY_NAME]);
  });

  it('各メモの下に、コメントを古い順に書いた人格の名前つきで出す', () => {
    const groups = buildClinicView(
      [note('n1')],
      [
        comment('c2', 'n1', { alterId: null, createdAt: iso(9, 5) }),
        comment('c1', 'n1', { alterId: 'b', createdAt: iso(9, 4) }),
      ],
      [alterA, alterB],
      categories,
    );
    expect(groups[0].categories[0].notes[0].comments.map((c) => [c.comment.id, c.authorName])).toEqual([
      ['c1', '人格B'],
      ['c2', 'わからない'],
    ]);
  });

  it('まだ話していないメモがなければ空', () => {
    expect(buildClinicView([note('d', { discussedAt: iso(9, 1) })], [], [alterA], categories)).toEqual([]);
  });

  it('名前ラベル用に、人格とコメントを書いた人格の色を持つ(「わからない」は null)', () => {
    const groups = buildClinicView(
      [note('n1'), note('n2', { alterId: null })],
      [comment('c1', 'n1', { alterId: 'b' }), comment('c2', 'n1', { alterId: null })],
      [alterA, alterB],
      categories,
    );
    expect(groups.map((group) => group.color)).toEqual(['#4a90d9', null]);
    expect(groups[0].categories[0].notes[0].comments.map((c) => c.authorColor)).toEqual(['#4a90d9', null]);
  });
});

describe('文字としてコピー(SPEC.md 8.3)', () => {
  it('表題の日付は、朝5時前でも実際の日付', () => {
    expect(clinicViewTitle(new Date(2026, 8, 28, 4, 59))).toBe('受診メモ(2026/9/28)');
    expect(clinicViewTitle(new Date(2026, 9, 1, 0, 30))).toBe('受診メモ(2026/10/1)');
  });

  it('見出し・【分類】・箇条書き・コメントの形になり、改行は2行目から字下げする', () => {
    const groups = buildClinicView(
      [
        note('n1', { alterId: 'a', body: '朝起きると頭が痛い', createdAt: iso(9, 1) }),
        note('n2', { alterId: 'a', body: '食欲がない', createdAt: iso(9, 2) }),
        note('n3', { alterId: 'a', categoryId: 'sleep', body: '夜中に2回目が覚める\n(2週間くらい前から)' }),
        note('n4', { alterId: null, body: '記憶がとぶことが増えた' }),
      ],
      [
        comment('c1', 'n1', { alterId: 'b', body: '私も同じ。朝がつらい' }),
        comment('c2', 'n3', { alterId: null, body: '1行目\n2行目', createdAt: iso(9, 3) }),
      ],
      [alterA, alterB],
      categories,
    );
    expect(buildClinicViewText(groups, new Date(2026, 8, 28, 21, 0))).toBe(
      [
        '受診メモ(2026/9/28)',
        '',
        '■ 人格A',
        '【体調】',
        '・朝起きると頭が痛い',
        '  └ 人格B:私も同じ。朝がつらい',
        '・食欲がない',
        '【睡眠】',
        '・夜中に2回目が覚める',
        '  (2週間くらい前から)',
        '  └ わからない:1行目',
        '    2行目',
        '',
        '■ わからない',
        '【体調】',
        '・記憶がとぶことが増えた',
      ].join('\n'),
    );
  });

  it('メモがないときは、表題と「まだ話していないメモはありません」(画面と同じ)', () => {
    expect(buildClinicViewText([], new Date(2026, 8, 28))).toBe('受診メモ(2026/9/28)\n\nまだ話していないメモはありません');
  });

  it('「メモ+交代記録」のときは、メモの下に交代記録の文を入れる(SPEC.md 8.3)', () => {
    expect(buildClinicViewText([], new Date(2026, 8, 28), '■ 交代の記録(9/1〜9/28)\n全1回')).toBe(
      '受診メモ(2026/9/28)\n\nまだ話していないメモはありません\n\n■ 交代の記録(9/1〜9/28)\n全1回',
    );
  });
});

describe('書いた人格の選択肢', () => {
  const hidden = alter('h', '人格C', 2, true);

  it('新しく書くときは、非表示でない人格を並び順で出す', () => {
    expect(selectableAuthors([alterA, hidden, alterB]).map((a) => a.id)).toEqual(['b', 'a']);
  });

  it('編集するメモの人格が非表示なら、その人格も出す', () => {
    expect(selectableAuthors([alterA, hidden, alterB], 'h').map((a) => a.id)).toEqual(['b', 'a', 'h']);
    expect(selectableAuthors([alterA, hidden, alterB], null).map((a) => a.id)).toEqual(['b', 'a']);
  });
});
