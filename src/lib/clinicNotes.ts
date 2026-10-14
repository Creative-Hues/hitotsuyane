// 受診メモとコメント(SPEC.md 8章)。すべて純粋関数(同じ入力なら同じ結果)。
// 日付は実際の日付を使う(表題の日付も、朝5時前に前の日にしない)。現在時刻は引数で受け取る。
import { UNKNOWN_ALTER_NAME, resolveRecordAlter } from './completionLabel';
import { formatCalendarDateSlash } from './timeFormat';
import type { Alter, ClinicNote, ClinicNoteCategory, ClinicNoteComment } from './types';
import { DEFAULT_TERM, withTerm } from './term';

/** 入力のヒント(SPEC.md 8.1) */
export const CLINIC_NOTE_HINT = 'いつから・どのくらい・何に困っているか';

/** 分類が見つからないときの表示名(ふつうは起きない。メモのある分類は削除できないため) */
export const UNKNOWN_CATEGORY_NAME = '(不明な分類)';

function byCreatedAt(a: { createdAt: string }, b: { createdAt: string }): number {
  return a.createdAt.localeCompare(b.createdAt);
}

/**
 * 一覧(SPEC.md 8.2)を「まだ話していないもの」と「話したもの」に分けて並べる。
 * - まだ:書いた日時の古い順(前から気になっているものが上)
 * - 話した:話した日時の新しい順
 */
export function splitClinicNotes(notes: readonly ClinicNote[]): { pending: ClinicNote[]; discussed: ClinicNote[] } {
  const pending = notes.filter((note) => note.discussedAt === null).sort(byCreatedAt);
  const discussed = notes
    .filter((note) => note.discussedAt !== null)
    .sort((a, b) => (b.discussedAt ?? '').localeCompare(a.discussedAt ?? ''));
  return { pending, discussed };
}

/** コメントをメモごとに分け、それぞれ古い順に並べる(SPEC.md 8.4) */
export function groupCommentsByNote(comments: readonly ClinicNoteComment[]): Map<string, ClinicNoteComment[]> {
  const byNote = new Map<string, ClinicNoteComment[]>();
  for (const comment of [...comments].sort(byCreatedAt)) {
    byNote.set(comment.noteId, [...(byNote.get(comment.noteId) ?? []), comment]);
  }
  return byNote;
}

/** メモかコメントか(文言に使う) */
export type AuthoredKind = 'メモ' | 'コメント';

/**
 * 編集画面の上に出す「人格Aが書いたメモ」(SPEC.md 8.1・8.4)。
 * 人格は名前と色で返す(画面で名前だけ色を付けるため)。「わからない」のときは alter が null
 */
export function authorHeading(
  alterId: string | null,
  kind: AuthoredKind,
  alterById: ReadonlyMap<string, Alter>,
  /** 「人格」の呼び方(SPEC.md 14章③) */
  term: string = DEFAULT_TERM,
): { alter: { name: string; color: string } | null; text: string } {
  const alter = alterId === null ? undefined : alterById.get(alterId);
  if (!alter) {
    return { alter: null, text: withTerm('書いた人格:わからない', term) };
  }
  return { alter: { name: alter.name, color: alter.color }, text: `${alter.name}が書いた${kind}` };
}

/**
 * 削除の確認文(SPEC.md 8.1・8.4)。
 * 例:「人格Aが書いたメモを削除しますか?コメント2件も一緒に削除されます。」
 * @param commentCount メモを削除するときの、そのメモのコメントの件数(コメントの削除では 0)
 */
export function deleteConfirmMessage(
  alterId: string | null,
  kind: AuthoredKind,
  alterById: ReadonlyMap<string, Alter>,
  commentCount = 0,
  /** 「人格」の呼び方(SPEC.md 14章③) */
  term: string = DEFAULT_TERM,
): string {
  const alter = alterId === null ? undefined : alterById.get(alterId);
  // 名前を入れる前の決まった文だけを、呼び方に置き換える(名前は置き換えない)
  const target = alter ? `${alter.name}が書いた${kind}` : `${withTerm('書いた人格がわからない', term)}${kind}`;
  const comments = commentCount > 0 ? `コメント${commentCount}件も一緒に削除されます。` : '';
  return `${target}を削除しますか?${comments}`;
}

/** 書いた人格の選択。null は「まだ選んでいない」、{ alterId: null } は「わからない」 */
export type AuthorSelection = { alterId: string | null } | null;

/** メモの入力内容(内容は前後の空白を取り除いたもの) */
export interface ClinicNoteInput {
  alterId: string | null;
  categoryId: string;
  body: string;
}

/** コメントの入力内容(内容は前後の空白を取り除いたもの) */
export interface ClinicNoteCommentInput {
  alterId: string | null;
  body: string;
}

export type FormResult<T> = { ok: true; input: T } | { ok: false; error: string };

/** 内容の前後の空白を取り除く。空になったら null(途中の改行はそのまま) */
function normalizeBody(body: string): string | null {
  const trimmed = body.trim();
  return trimmed === '' ? null : trimmed;
}

/** メモの入力をチェックする(SPEC.md 8.1)。書いた人格・分類は選ばないと保存できない */
export function validateClinicNoteForm(values: {
  author: AuthorSelection;
  categoryId: string | null;
  body: string;
}): FormResult<ClinicNoteInput> {
  if (values.author === null) {
    return { ok: false, error: '書いた人格を選んでください' };
  }
  if (values.categoryId === null) {
    return { ok: false, error: '分類を選んでください' };
  }
  const body = normalizeBody(values.body);
  if (body === null) {
    return { ok: false, error: '内容を入力してください' };
  }
  return { ok: true, input: { alterId: values.author.alterId, categoryId: values.categoryId, body } };
}

/** コメントの入力をチェックする(SPEC.md 8.4)。書いた人格は選ばないと保存できない */
export function validateClinicNoteCommentForm(values: {
  author: AuthorSelection;
  body: string;
}): FormResult<ClinicNoteCommentInput> {
  if (values.author === null) {
    return { ok: false, error: '書いた人格を選んでください' };
  }
  const body = normalizeBody(values.body);
  if (body === null) {
    return { ok: false, error: '内容を入力してください' };
  }
  return { ok: true, input: { alterId: values.author.alterId, body } };
}

/** 診察用の表示のコメント1件(書いた人格の名前つき) */
export interface ClinicViewComment {
  comment: ClinicNoteComment;
  authorName: string;
  /** 書いた人格の色(名前ラベル用)。「わからない」は null */
  authorColor: string | null;
}

/** 診察用の表示の1つの人格の見出しの中身 */
export interface ClinicViewGroup {
  /** 人格のID。「わからない」(人格が見つからないときも)は null */
  alterId: string | null;
  name: string;
  /** 人格の色(名前ラベル用)。「わからない」は null */
  color: string | null;
  /** 分類ごと(分類の並び順) */
  categories: {
    categoryId: string;
    name: string;
    /** 書いた順。各メモの下にコメント(古い順) */
    notes: { note: ClinicNote; comments: ClinicViewComment[] }[];
  }[];
}

/**
 * 診察用の表示(SPEC.md 8.3)。まだ話していないメモだけを、人格ごと → 分類ごとに並べる。
 * - 人格は人格の並び順(非表示の人格も、その名前で出す)。「わからない」は最後
 * - 分類は分類の並び順(見つからない分類は最後)。同じ分類の中は書いた順
 */
export function buildClinicView(
  notes: readonly ClinicNote[],
  comments: readonly ClinicNoteComment[],
  alters: readonly Alter[],
  categories: readonly ClinicNoteCategory[],
): ClinicViewGroup[] {
  const alterById = new Map(alters.map((alter) => [alter.id, alter]));
  const commentsByNote = groupCommentsByNote(comments);
  const pending = splitClinicNotes(notes).pending;
  const alterKeyOf = (note: ClinicNote) => (note.alterId !== null && alterById.has(note.alterId) ? note.alterId : null);

  // 人格の並び順 → 最後に「わからない」
  const alterKeys: (string | null)[] = [...[...alters].sort((a, b) => a.order - b.order).map((a) => a.id), null];
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
  const knownCategoryIds = new Set(categories.map((category) => category.id));

  return alterKeys.flatMap((alterKey): ClinicViewGroup[] => {
    const alterNotes = pending.filter((note) => alterKeyOf(note) === alterKey);
    if (alterNotes.length === 0) {
      return [];
    }
    const categoryGroups = [
      ...sortedCategories.map((category) => ({ categoryId: category.id, name: category.name })),
      // 見つからない分類のメモは、分類ごとに最後にまとめる
      ...[...new Set(alterNotes.map((n) => n.categoryId).filter((id) => !knownCategoryIds.has(id)))].map((id) => ({
        categoryId: id,
        name: UNKNOWN_CATEGORY_NAME,
      })),
    ].flatMap(({ categoryId, name }) => {
      const categoryNotes = alterNotes.filter((note) => note.categoryId === categoryId);
      if (categoryNotes.length === 0) {
        return [];
      }
      return [
        {
          categoryId,
          name,
          notes: categoryNotes.map((note) => ({
            note,
            comments: (commentsByNote.get(note.id) ?? []).map((comment) => {
              const author = resolveRecordAlter(comment, alterById);
              return { comment, authorName: author.name, authorColor: author.color };
            }),
          })),
        },
      ];
    });
    return [
      {
        alterId: alterKey,
        name: alterKey === null ? UNKNOWN_ALTER_NAME : (alterById.get(alterKey)?.name ?? UNKNOWN_ALTER_NAME),
        color: alterKey === null ? null : (alterById.get(alterKey)?.color ?? null),
        categories: categoryGroups,
      },
    ];
  });
}

/** 診察用の表示の表題「受診メモ(2026/9/28)」。日付は表示・コピーしたときの実際の日付 */
export function clinicViewTitle(now: Date): string {
  return `受診メモ(${formatCalendarDateSlash(now)})`;
}

/**
 * 改行のある文を、1行目に先頭の印を付け、2行目からは字下げする。
 * 例:markedLines('・', '  ', 'A\nB') → ['・A', '  B']
 */
function markedLines(mark: string, indent: string, body: string): string[] {
  return body.split('\n').map((line, index) => (index === 0 ? `${mark}${line}` : `${indent}${line}`));
}

/** まだ話していないメモがないときの文(SPEC.md 8.3) */
export const NO_PENDING_NOTES_TEXT = 'まだ話していないメモはありません';

/**
 * 「文字としてコピー」の文(SPEC.md 8.3)。画面の診察用の表示と同じ内容。
 * 改行のあるメモ・コメントは、2行目から字下げする
 * @param switchText 「メモ+交代記録」のときの、交代記録の文(buildSwitchSummaryText)。メモの下に入れる
 */
export function buildClinicViewText(groups: readonly ClinicViewGroup[], now: Date, switchText?: string): string {
  const tail = switchText === undefined ? [] : [switchText];
  if (groups.length === 0) {
    return [clinicViewTitle(now), NO_PENDING_NOTES_TEXT, ...tail].join('\n\n');
  }
  const blocks = groups.map((group) => {
    const lines = [`■ ${group.name}`];
    for (const category of group.categories) {
      lines.push(`【${category.name}】`);
      for (const { note, comments } of category.notes) {
        lines.push(...markedLines('・', '  ', note.body));
        for (const { comment, authorName } of comments) {
          lines.push(...markedLines(`  └ ${authorName}:`, '    ', comment.body));
        }
      }
    }
    return lines.join('\n');
  });
  return [clinicViewTitle(now), ...blocks, ...tail].join('\n\n');
}

/**
 * 書いた人格の選択肢(SPEC.md 8.1・8.4)。非表示でない人格を並び順で出す。
 * 編集するメモ・コメントの人格が非表示なら、その人格も並び順の位置に出す(選ばれたままにするため)
 * @param savedAlterId 編集するメモ・コメントに保存されている人格のID(新しく書くときは渡さない)
 */
export function selectableAuthors(alters: readonly Alter[], savedAlterId?: string | null): Alter[] {
  return [...alters]
    .filter((alter) => !alter.hidden || alter.id === savedAlterId)
    .sort((a, b) => a.order - b.order);
}
