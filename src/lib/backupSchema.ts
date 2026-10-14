// バックアップの中身の形のチェック(SPEC.md 12章)。純粋関数。
// ライブラリを使わず、テーブルごとに「項目名 → チェック関数」の表で確かめる。
// 表は Record<keyof 型, …> なので、型に項目を足したら、ここも直さないとビルドが通らない。
import { buildInitialBucketAlters } from './bucket';
import { buildInitialClinicStaff } from './clinicVisits';
import { buildInitialMedicationTimings } from './medicationTimings';
import { buildInitialSwitchTags, guessFromAlterId } from './switchLog';
import type {
  Alter,
  AlterCategory,
  BucketAlter,
  BucketItem,
  ClinicNote,
  ClinicNoteCategory,
  ClinicNoteComment,
  ClinicStaff,
  ClinicVisit,
  CompletionRecord,
  Cycle,
  Medication,
  MedicationIntake,
  MedicationTiming,
  ProfileSection,
  StockLog,
  SwitchLog,
  SwitchTag,
  Task,
} from './types';

/** 1つの値をチェックする関数 */
type Check = (value: unknown) => boolean;

/** 型 T の全項目についてのチェック表 */
type Schema<T> = { [K in keyof T]-?: Check };

const isString: Check = (value) => typeof value === 'string';
const isNumber: Check = (value) => typeof value === 'number' && Number.isFinite(value);
const isBoolean: Check = (value) => typeof value === 'boolean';
const isNullableString: Check = (value) => value === null || typeof value === 'string';
const isStringArray: Check = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');

function oneOf(...allowed: readonly unknown[]): Check {
  return (value) => allowed.includes(value);
}

/** 項目がないことも許す(古い記録にない項目用) */
function optional(check: Check): Check {
  return (value) => value === undefined || check(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isCycle: Check = (value) => {
  if (!isRecord(value)) {
    return false;
  }
  const cycle = value as Partial<Cycle>;
  switch (cycle.type) {
    case 'daily':
    case 'weekly':
    case 'monthly':
    case 'none':
      return true;
    case 'everyNDays':
      return Number.isSafeInteger(cycle.n) && (cycle.n ?? 0) >= 2;
    default:
      return false;
  }
};

const alterSchema: Schema<Alter> = {
  id: isString,
  name: isString,
  color: isString,
  hidden: isBoolean,
  order: isNumber,
  createdAt: isString,
  reading: isString,
  categoryId: isNullableString,
  age: isString,
  gender: isString,
  identify: isString,
};

const namedItemSchema: Schema<AlterCategory & ClinicNoteCategory & ClinicStaff> = {
  id: isString,
  name: isString,
  order: isNumber,
  createdAt: isString,
};

const taskSchema: Schema<Task> = {
  id: isString,
  name: isString,
  cycle: isCycle,
  careAlterIds: isStringArray,
  hidden: isBoolean,
  order: isNumber,
  createdAt: isString,
};

const recordSchema: Schema<CompletionRecord> = {
  id: isString,
  taskId: isString,
  alterId: isNullableString,
  completedAt: isString,
  careAlterIdsAtCompletion: optional(isStringArray),
};

const profileSectionSchema: Schema<ProfileSection> = {
  id: isString,
  alterId: isNullableString,
  title: isString,
  body: isString,
  includeInPdf: isBoolean,
  order: isNumber,
  createdAt: isString,
};

const medicationSchema: Schema<Medication> = {
  id: isString,
  name: isString,
  kind: oneOf('scheduled', 'asNeeded'),
  // 時間帯のID。時間帯の一覧にあるかどうかは、全体を読んだあとで確かめる(checkTimingReferences)
  timings: isStringArray,
  dosePerTake: isNumber,
  remaining: isNumber,
  status: oneOf('active', 'stopped'),
  order: isNumber,
  createdAt: isString,
};

const medicationIntakeSchema: Schema<MedicationIntake> = {
  id: isString,
  medicationId: isString,
  alterId: isNullableString,
  takenAt: isString,
  timing: isNullableString,
  deducted: isNumber,
  reason: isString,
};

const medicationTimingSchema: Schema<MedicationTiming> = {
  id: isString,
  name: isString,
  hidden: isBoolean,
  order: isNumber,
  createdAt: isString,
};

const stockLogSchema: Schema<StockLog> = {
  id: isString,
  medicationId: isString,
  kind: oneOf('initial', 'refill', 'recount'),
  amount: isNumber,
  at: isString,
};

const clinicNoteCommentSchema: Schema<ClinicNoteComment> = {
  id: isString,
  noteId: isString,
  alterId: isNullableString,
  body: isString,
  createdAt: isString,
};

const clinicNoteSchema: Schema<ClinicNote> = {
  id: isString,
  alterId: isNullableString,
  categoryId: isString,
  body: isString,
  createdAt: isString,
  discussedAt: isNullableString,
};

const bucketItemSchema: Schema<BucketItem> = {
  id: isString,
  alterId: isString,
  body: isString,
  order: isNumber,
  createdAt: isString,
  achievedAt: isNullableString,
  helperAlterIds: isStringArray,
  // フェーズ11で追加。ないファイルは「削除していない」として読み込む(SPEC.md 12章)
  deletedAt: optional(isString),
};

const switchTagSchema: Schema<SwitchTag> = {
  id: isString,
  name: isString,
  hidden: isBoolean,
  order: isNumber,
  createdAt: isString,
};

const switchLogSchema: Schema<SwitchLog> = {
  id: isString,
  alterId: isNullableString,
  noticedAt: isString,
  switchedAt: isNullableString,
  // きっかけのID。きっかけにあるかどうかは、全体を読んだあとで確かめる(checkReferences)
  tagIds: isStringArray,
  // 2026年10月のブラッシュアップ フェーズ2で追加。ない記録は、推測で補う(completeSwitchLogs。SPEC.md 12章)
  // 人格にあるかどうかは、全体を読んだあとで確かめる(checkReferences)
  fromAlterId: optional(isNullableString),
  fromAlterSource: optional(oneOf('guessed', 'confirmed')),
};

const bucketAlterSchema: Schema<BucketAlter> = {
  // 人格にあるかどうかは、全体を読んだあとで確かめる(checkReferences)
  alterId: isString,
  hidden: isBoolean,
  addedAt: isString,
};

const clinicVisitSchema: Schema<ClinicVisit> = {
  id: isString,
  visitedOn: isString,
  // 人格・話した相手にあるかどうかは、全体を読んだあとで確かめる(checkReferences)
  alterIds: isStringArray,
  staffIds: isStringArray,
  createdAt: isString,
};

/** バックアップに入れるデータ(端末の設定は入れない) */
export interface BackupData {
  alters: Alter[];
  categories: AlterCategory[];
  profileSections: ProfileSection[];
  tasks: Task[];
  records: CompletionRecord[];
  medicationTimings: MedicationTiming[];
  medications: Medication[];
  medicationIntakes: MedicationIntake[];
  stockLogs: StockLog[];
  clinicNotes: ClinicNote[];
  clinicNoteCategories: ClinicNoteCategory[];
  clinicNoteComments: ClinicNoteComment[];
  bucketItems: BucketItem[];
  switchTags: SwitchTag[];
  switchLogs: SwitchLog[];
  /** バケットに出す人格(2026年10月のブラッシュアップ フェーズ2で追加。SPEC.md 9.1) */
  bucketAlters: BucketAlter[];
  /** 受診の記録(2026年10月のブラッシュアップ フェーズ3で追加。SPEC.md 8.5) */
  clinicVisits: ClinicVisit[];
  /** 話した相手の選択肢(同じく追加。SPEC.md 8.6) */
  clinicStaff: ClinicStaff[];
}

/** テーブルごとのチェック表と、エラー表示用の名前 */
const TABLES: { [K in keyof BackupData]: { label: string; schema: Schema<BackupData[K][number]> } } = {
  alters: { label: '人格', schema: alterSchema },
  categories: { label: '区分', schema: namedItemSchema },
  profileSections: { label: 'プロフィール', schema: profileSectionSchema },
  tasks: { label: 'タスク', schema: taskSchema },
  records: { label: '完了記録', schema: recordSchema },
  medicationTimings: { label: '服薬の時間帯', schema: medicationTimingSchema },
  medications: { label: '薬', schema: medicationSchema },
  medicationIntakes: { label: '服薬記録', schema: medicationIntakeSchema },
  stockLogs: { label: '在庫の履歴', schema: stockLogSchema },
  clinicNotes: { label: '受診メモ', schema: clinicNoteSchema },
  clinicNoteCategories: { label: '受診メモの分類', schema: namedItemSchema },
  clinicNoteComments: { label: '受診メモのコメント', schema: clinicNoteCommentSchema },
  bucketItems: { label: 'バケット', schema: bucketItemSchema },
  switchTags: { label: '交代のきっかけ', schema: switchTagSchema },
  switchLogs: { label: '交代の記録', schema: switchLogSchema },
  // 人格のあとに読む(ないときに人格から作るため。rowsOf)
  bucketAlters: { label: 'バケットに出す人格', schema: bucketAlterSchema },
  clinicStaff: { label: '話した相手の選択肢', schema: namedItemSchema },
  clinicVisits: { label: '受診の記録', schema: clinicVisitSchema },
};

/** バックアップに入れるテーブルの名前(並び順は書き出しの順) */
export const BACKUP_TABLE_NAMES = Object.keys(TABLES) as (keyof BackupData)[];

/**
 * 1件分をチェックし、決まった項目だけを取り出す(知らない項目は捨てる)。
 * 形が正しくなければ null。
 */
function pickValid<T>(value: unknown, schema: Schema<T>): T | null {
  if (!isRecord(value)) {
    return null;
  }
  const picked: Record<string, unknown> = {};
  for (const [key, check] of Object.entries(schema) as [string, Check][]) {
    if (!check(value[key])) {
      return null;
    }
    // 値がない任意の項目は、項目ごと入れない
    if (value[key] !== undefined) {
      picked[key] = value[key];
    }
  }
  return picked as T;
}

/** 1件の主キー(ふつうは id。「バケットに出す人格」は人格のID) */
function rowKeyOf(item: BackupData[keyof BackupData][number]): string {
  return 'id' in item ? item.id : item.alterId;
}

/** 1つのテーブル分をチェックする。だめなときは理由の文字列を返す */
function parseTable<K extends keyof BackupData>(name: K, rows: unknown): BackupData[K] | string {
  const { label, schema } = TABLES[name];
  if (!Array.isArray(rows)) {
    return `「${label}」のデータがありません`;
  }
  const result: BackupData[K][number][] = [];
  const ids = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const item = pickValid(row, schema);
    if (item === null) {
      return `「${label}」の${index + 1}件目の形が正しくありません`;
    }
    if (ids.has(rowKeyOf(item))) {
      return `「${label}」に同じIDのデータが2つあります`;
    }
    ids.add(rowKeyOf(item));
    result.push(item);
  }
  return result as BackupData[K];
}

/**
 * ほかのデータを指す項目が、ファイルの中にあるデータを指しているか確かめる(SPEC.md 12章)。
 * - 薬と服薬記録の時間帯が、時間帯の一覧にあるか
 * - コメントのメモが、受診メモにあるか
 * - プロフィールの見出しの人格が、人格にあるか(「全体のこと」の見出しは人格を指さない)
 * - 交代の記録のきっかけが、交代のきっかけにあるか
 * 人格の区分は確かめない(ない区分を指す人格は「未分類」に出す。SPEC.md 12章)
 * だめなときは理由の文字列を返す
 */
function checkReferences(data: BackupData): string | null {
  const timingIds = new Set(data.medicationTimings.map((timing) => timing.id));
  const medicationIndex = data.medications.findIndex((m) => m.timings.some((id) => !timingIds.has(id)));
  if (medicationIndex >= 0) {
    return `「薬」の${medicationIndex + 1}件目の時間帯が見つかりません`;
  }
  const intakeIndex = data.medicationIntakes.findIndex((i) => i.timing !== null && !timingIds.has(i.timing));
  if (intakeIndex >= 0) {
    return `「服薬記録」の${intakeIndex + 1}件目の時間帯が見つかりません`;
  }
  const noteIds = new Set(data.clinicNotes.map((note) => note.id));
  const commentIndex = data.clinicNoteComments.findIndex((c) => !noteIds.has(c.noteId));
  if (commentIndex >= 0) {
    return `「受診メモのコメント」の${commentIndex + 1}件目のメモが見つかりません`;
  }
  const alterIds = new Set(data.alters.map((alter) => alter.id));
  const sectionIndex = data.profileSections.findIndex((s) => s.alterId !== null && !alterIds.has(s.alterId));
  if (sectionIndex >= 0) {
    return `「プロフィール」の${sectionIndex + 1}件目の人格が見つかりません`;
  }
  const tagIds = new Set(data.switchTags.map((tag) => tag.id));
  const switchLogIndex = data.switchLogs.findIndex((log) => log.tagIds.some((id) => !tagIds.has(id)));
  if (switchLogIndex >= 0) {
    return `「交代の記録」の${switchLogIndex + 1}件目のきっかけが見つかりません`;
  }
  const fromIndex = data.switchLogs.findIndex((log) => log.fromAlterId !== null && !alterIds.has(log.fromAlterId));
  if (fromIndex >= 0) {
    return `「交代の記録」の${fromIndex + 1}件目の交代前の人格が見つかりません`;
  }
  const bucketAlterIndex = data.bucketAlters.findIndex((entry) => !alterIds.has(entry.alterId));
  if (bucketAlterIndex >= 0) {
    return `「バケットに出す人格」の${bucketAlterIndex + 1}件目の人格が見つかりません`;
  }
  const visitAlterIndex = data.clinicVisits.findIndex((visit) => visit.alterIds.some((id) => !alterIds.has(id)));
  if (visitAlterIndex >= 0) {
    return `「受診の記録」の${visitAlterIndex + 1}件目の人格が見つかりません`;
  }
  const staffIds = new Set(data.clinicStaff.map((item) => item.id));
  const visitStaffIndex = data.clinicVisits.findIndex((visit) => visit.staffIds.some((id) => !staffIds.has(id)));
  if (visitStaffIndex >= 0) {
    return `「受診の記録」の${visitStaffIndex + 1}件目の話した相手が見つかりません`;
  }
  return null;
}

/**
 * あとのフェーズで足したテーブルがない古いファイルのとき、そのテーブルの中身を決める(SPEC.md 12章)。
 * - 服薬の時間帯の一覧(フェーズ9段階Eで追加):最初の4つの時間帯。作成日時は書き出した日時
 * - 受診メモのコメント(フェーズ10で追加):コメントなし
 * - 交代のきっかけ(フェーズ15で追加):最初のきっかけ。作成日時は書き出した日時
 * - 交代の記録(フェーズ15で追加):記録なし
 * - バケットに出す人格(2026年10月のブラッシュアップ フェーズ2で追加):非表示でない人格全員(版7に上げるときと同じ)。
 *   追加した日時は書き出した日時
 * - 受診の記録(フェーズ3で追加):記録なし
 * - 話した相手の選択肢(フェーズ3で追加):最初の4つ。作成日時は書き出した日時
 * ほかのテーブルは、ないときはそのまま(読み込まない)
 * @param parsed ここまでに読んだテーブル(人格は「バケットに出す人格」より先に読む)
 */
function rowsOf(
  name: keyof BackupData,
  value: Record<string, unknown>,
  exportedAt: string,
  parsed: Partial<BackupData>,
): unknown {
  if (value[name] !== undefined) {
    return value[name];
  }
  switch (name) {
    case 'bucketAlters':
      return buildInitialBucketAlters(parsed.alters ?? [], exportedAt);
    case 'clinicVisits':
      return [];
    case 'clinicStaff':
      return buildInitialClinicStaff(exportedAt);
    case 'medicationTimings':
      return buildInitialMedicationTimings(exportedAt);
    case 'clinicNoteComments':
      return [];
    case 'switchTags':
      return buildInitialSwitchTags(exportedAt);
    case 'switchLogs':
      return [];
    default:
      return undefined;
  }
}

/**
 * データ部分全体をチェックする。だめなときは理由の文字列を返す
 * @param exportedAt ファイルを書き出した日時(古いファイルに足りないテーブルを補うのに使う)
 */
export function parseBackupData(value: unknown, exportedAt: string): BackupData | string {
  if (!isRecord(value)) {
    return 'データがありません';
  }
  const data: Partial<Record<keyof BackupData, unknown>> = {};
  for (const name of BACKUP_TABLE_NAMES) {
    const parsed = parseTable(name, rowsOf(name, value, exportedAt, data as Partial<BackupData>));
    if (typeof parsed === 'string') {
      return parsed;
    }
    data[name] = parsed;
  }
  const complete = { ...(data as BackupData), switchLogs: completeSwitchLogs(data.switchLogs as SwitchLog[]) };
  return checkReferences(complete) ?? complete;
}

/**
 * 交代前の人格がない記録(版6までに書き出したファイル)に、版7に上げるときと同じやり方で推測を補い、
 * 「推測」にする(SPEC.md 12章)。交代前の人格がある記録はそのまま
 */
function completeSwitchLogs(logs: readonly SwitchLog[]): SwitchLog[] {
  // 形のチェックでは、ない項目を許している(optional)。ここで必ず入れる
  const isComplete = (log: Partial<SwitchLog>) => log.fromAlterId !== undefined && log.fromAlterSource !== undefined;
  return logs.map((log) =>
    isComplete(log) ? log : { ...log, fromAlterId: guessFromAlterId(logs, log), fromAlterSource: 'guessed' },
  );
}
