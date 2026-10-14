// データベースの定義(Dexie = IndexedDB を使いやすくするライブラリ)
import { Dexie, type EntityTable, type Transaction } from 'dexie';
import type {
  Alter,
  AlterCategory,
  AppMeta,
  Board,
  BoardComment,
  BoardSeen,
  BoardThread,
  BucketAlter,
  BucketItem,
  ClinicNote,
  ClinicNoteCategory,
  ClinicNoteComment,
  ClinicStaff,
  ClinicVisit,
  CompletionRecord,
  Medication,
  MedicationIntake,
  MedicationTiming,
  ProfileSection,
  Reaction,
  ReactionKind,
  StockLog,
  SwitchLog,
  SwitchLogV6,
  SwitchTag,
  Task,
} from '../lib/types';
import { buildHomeBoard, buildInitialReactionKinds } from '../lib/board';
import { buildInitialBucketAlters } from '../lib/bucket';
import { buildInitialClinicStaff } from '../lib/clinicVisits';
import { buildInitialMedicationTimings } from '../lib/medicationTimings';
import { buildInitialSwitchTags, fillFromAlters } from '../lib/switchLog';
import {
  buildInitialCategories,
  buildInitialClinicNoteCategories,
  buildMissingProfileSections,
  buildNewInstallClinicNoteCategories,
  upgradeAlterToV2,
  type AlterV1,
} from './initialData';
import { DB_NAME } from '../lib/appTarget';

export class AppDatabase extends Dexie {
  alters!: EntityTable<Alter, 'id'>;
  tasks!: EntityTable<Task, 'id'>;
  records!: EntityTable<CompletionRecord, 'id'>;
  categories!: EntityTable<AlterCategory, 'id'>;
  profileSections!: EntityTable<ProfileSection, 'id'>;
  medications!: EntityTable<Medication, 'id'>;
  medicationIntakes!: EntityTable<MedicationIntake, 'id'>;
  medicationTimings!: EntityTable<MedicationTiming, 'id'>;
  stockLogs!: EntityTable<StockLog, 'id'>;
  clinicNotes!: EntityTable<ClinicNote, 'id'>;
  clinicNoteCategories!: EntityTable<ClinicNoteCategory, 'id'>;
  clinicNoteComments!: EntityTable<ClinicNoteComment, 'id'>;
  bucketItems!: EntityTable<BucketItem, 'id'>;
  switchTags!: EntityTable<SwitchTag, 'id'>;
  switchLogs!: EntityTable<SwitchLog, 'id'>;
  bucketAlters!: EntityTable<BucketAlter, 'alterId'>;
  clinicVisits!: EntityTable<ClinicVisit, 'id'>;
  clinicStaff!: EntityTable<ClinicStaff, 'id'>;
  boards!: EntityTable<Board, 'id'>;
  boardThreads!: EntityTable<BoardThread, 'id'>;
  boardComments!: EntityTable<BoardComment, 'id'>;
  reactionKinds!: EntityTable<ReactionKind, 'id'>;
  reactions!: EntityTable<Reaction, 'id'>;
  boardSeen!: EntityTable<BoardSeen, 'threadId'>;
  meta!: EntityTable<AppMeta, 'key'>;

  // データベースの名前は src/lib/appTarget.ts で決める(SPEC.md 19章・21章)。
  // 本番は、URL を変えても以前の名前のまま変えない(変えると、同じ場所に保存されていたデータを読めなくなるため)。
  // テスト版は、本番のデータに触れないよう別の名前にする
  constructor(name = DB_NAME) {
    super(name);
    // 最初の項目が主キー、以降は検索に使う項目(インデックス)
    // 版1は消さずに残す(古い版のデータから順に引き継ぐため)
    this.version(1).stores({
      alters: 'id, order',
      tasks: 'id, order',
      records: 'id, taskId, completedAt, [taskId+completedAt]',
    });
    // 版2:SPEC.md 3.5。今のテーブルの主キーは変えず、新しいテーブルを足す
    this.version(2)
      .stores({
        categories: 'id, order',
        profileSections: 'id, alterId, order',
        medications: 'id, order',
        medicationIntakes: 'id, medicationId, takenAt',
        stockLogs: 'id, medicationId, at',
        clinicNotes: 'id, createdAt',
        clinicNoteCategories: 'id, order',
        bucketItems: 'id, alterId, order',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        // 今の人格に基本情報の初期値を足し、最初のデータを入れる
        const alters = tx.table<AlterV1, string>('alters');
        const upgraded = (await alters.toArray()).map(upgradeAlterToV2);
        await tx.table<Alter, string>('alters').bulkPut(upgraded);
        await addInitialData(tx, new Date());
      });
    // 版3:SPEC.md 3.5・7.8。服薬の時間帯の一覧を足し、最初の4つを入れる
    // 最初の4つのIDは、薬・服薬記録に入っていた時間帯の値と同じなので、薬と服薬記録は書き換えない
    this.version(3)
      .stores({ medicationTimings: 'id, order' })
      .upgrade((tx) => addInitialMedicationTimings(tx, new Date()));
    // 版4:SPEC.md 3.5・8.4。受診メモのコメントのテーブルを足す
    // 空のテーブルを足すだけなので、変換の処理はない(今のデータには手を触れない)
    this.version(4).stores({ clinicNoteComments: 'id, noteId, createdAt' });
    // 版5:SPEC.md 3.5・10.4・10.5。テーブルの形は変えず、最初のプロフィールの見出しを入れる
    // (見出しのない人格に基本の見出し、「全体のこと」に最初の見出し。今のデータは書き換えない)
    this.version(5)
      .stores({})
      .upgrade((tx) => addMissingProfileSections(tx, new Date()));
    // 版6:SPEC.md 3.5・17章。交代のきっかけと交代の記録のテーブルを足し、最初のきっかけを入れる
    // 今のデータは書き換えない
    this.version(6)
      .stores({ switchTags: 'id, order', switchLogs: 'id, alterId, noticedAt' })
      .upgrade((tx) => addInitialSwitchTags(tx, new Date()));
    // 版7:SPEC.md 3.5(2026年10月のブラッシュアップ フェーズ2)。
    // 版を上げる前に、移行前のバックアップ(SPEC.md 18.4)を beforeUpdate.ts で保存してから開く。
    // - 周期の「期限なし」は項目を足すだけなので、今のタスクは書き換えない
    // - 「バケットに出す人格」のテーブルを足し、今バケットに出ている人格(非表示でない人格)全員を入れる
    // - 交代の記録に、交代前の人格を推測で補う(すべて「推測」)
    this.version(7)
      .stores({ bucketAlters: 'alterId' })
      .upgrade((tx) => upgradeToV7(tx, new Date()));
    // 版8:SPEC.md 3.5(2026年10月のブラッシュアップ フェーズ3)。
    // 受診の記録と、話した相手の選択肢のテーブルを足し、最初の選択肢を入れる。今のデータは書き換えない
    // (版を上げる前の移行前のバックアップは、版7と同じく beforeUpdate.ts で保存する)
    this.version(8)
      .stores({ clinicVisits: 'id, visitedOn', clinicStaff: 'id, order' })
      .upgrade((tx) => addInitialClinicStaff(tx, new Date()));
    // 版9:SPEC.md 3.5(2026年10月のブラッシュアップ フェーズ4)。
    // 掲示板の板・スレッド・コメント・リアクションの選択肢・リアクション・「見た」の記録のテーブルを足し、
    // ホームの板とリアクションの最初の選択肢を入れる。今のデータは書き換えない
    this.version(9)
      .stores({
        boards: 'id, order',
        boardThreads: 'id, boardId',
        boardComments: 'id, threadId',
        reactionKinds: 'id, order',
        reactions: 'id, targetId, alterId',
        boardSeen: 'threadId',
      })
      .upgrade((tx) => addInitialBoardData(tx, new Date()));
    // 新しく入れたとき(版1〜9の upgrade を通らない)の最初のデータ
    // 区分は空で始め、受診メモの分類は呼び方を使わない名前にする(SPEC.md 14章③)
    this.on('populate', async (tx) => {
      const now = new Date();
      await tx
        .table<ClinicNoteCategory, string>('clinicNoteCategories')
        .bulkAdd(buildNewInstallClinicNoteCategories(now, () => crypto.randomUUID()));
      await addInitialMedicationTimings(tx, now);
      await addMissingProfileSections(tx, now);
      await addInitialSwitchTags(tx, now);
      await addInitialClinicStaff(tx, now);
      await addInitialBoardData(tx, now);
    });
  }
}

/** 版7に上げるときの変換(SPEC.md 3.5)。「バケットに出す人格」を入れ、交代の記録に交代前の人格を補う */
async function upgradeToV7(tx: Transaction, now: Date): Promise<void> {
  const alters = await tx.table<Alter, string>('alters').toArray();
  await tx
    .table<BucketAlter, string>('bucketAlters')
    .bulkAdd(buildInitialBucketAlters(alters, now.toISOString()));
  const filled = fillFromAlters(await tx.table<SwitchLogV6, string>('switchLogs').toArray());
  await tx.table<SwitchLog, string>('switchLogs').bulkPut(filled);
}

/** 最初の区分と、受診メモの分類を入れる */
async function addInitialData(tx: Transaction, now: Date): Promise<void> {
  const newId = () => crypto.randomUUID();
  await tx.table<AlterCategory, string>('categories').bulkAdd(buildInitialCategories(now, newId));
  await tx
    .table<ClinicNoteCategory, string>('clinicNoteCategories')
    .bulkAdd(buildInitialClinicNoteCategories(now, newId));
}

/** 最初の4つの服薬の時間帯を入れる(SPEC.md 7.8) */
async function addInitialMedicationTimings(tx: Transaction, now: Date): Promise<void> {
  await tx
    .table<MedicationTiming, string>('medicationTimings')
    .bulkAdd(buildInitialMedicationTimings(now.toISOString()));
}

/** ホームの板と、リアクションの最初の選択肢を入れる(SPEC.md 22.2・22.5) */
async function addInitialBoardData(tx: Transaction, now: Date): Promise<void> {
  await tx.table<Board, string>('boards').add(buildHomeBoard(now.toISOString()));
  await tx.table<ReactionKind, string>('reactionKinds').bulkAdd(buildInitialReactionKinds(now.toISOString()));
}

/** 話した相手の最初の選択肢を入れる(SPEC.md 8.6) */
async function addInitialClinicStaff(tx: Transaction, now: Date): Promise<void> {
  await tx.table<ClinicStaff, string>('clinicStaff').bulkAdd(buildInitialClinicStaff(now.toISOString()));
}

/** 最初のきっかけを入れる(SPEC.md 17.2) */
async function addInitialSwitchTags(tx: Transaction, now: Date): Promise<void> {
  await tx.table<SwitchTag, string>('switchTags').bulkAdd(buildInitialSwitchTags(now.toISOString()));
}

/** 見出しが1つもない人格と「全体のこと」に、最初の見出しを入れる(SPEC.md 3.5) */
async function addMissingProfileSections(tx: Transaction, now: Date): Promise<void> {
  const alters = await tx.table<Alter, string>('alters').toArray();
  const sections = tx.table<ProfileSection, string>('profileSections');
  const missing = buildMissingProfileSections(alters, await sections.toArray(), now, () => crypto.randomUUID());
  await sections.bulkAdd(missing);
}

/** アプリ全体で使うデータベース */
export const db = new AppDatabase();
