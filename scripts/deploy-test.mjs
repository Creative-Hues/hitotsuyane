// テスト版を hitotsuyane-test に反映する(SPEC.md 21章)
// 使い方:npm run deploy:test(送らずに中身だけ作るときは npm run deploy:test -- --dry-run)
//
// 1. dev ブランチで、変更がすべてコミットされているか確かめる(どのコミットから作ったかを残すため)
// 2. テストを通し、テスト版としてビルドする(dist-test)
// 3. ビルドの中に本番のデータベースの名前(did-todo)がないことを確かめる
// 4. hitotsuyane-test の中身をビルドしたものに入れ替えて push する(ソースコードは送らない)
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TEST_REPO_URL = 'https://github.com/Creative-Hues/hitotsuyane-test.git';
const BUILD_DIR = 'dist-test';
const WORK_DIR = '.deploy-test';
const PROD_DB_NAME = 'did-todo';
const dryRun = process.argv.includes('--dry-run');

/** コマンドを実行する(画面に出しながら)。失敗したらそこで止まる */
function run(command, options = {}) {
  console.log(`> ${command}`);
  execSync(command, { stdio: 'inherit', ...options });
}

/** コマンドの結果の文字を返す */
function read(command, options = {}) {
  return execSync(command, { encoding: 'utf8', ...options }).trim();
}

function stop(message) {
  console.error(`\n止めました:${message}`);
  process.exit(1);
}

/** フォルダの中のファイルを、すべて読んで探す */
function filesContaining(dir, text) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      found.push(...filesContaining(path, text));
    } else if (readFileSync(path).includes(text)) {
      found.push(path);
    }
  }
  return found;
}

// 1. dev ブランチで、変更がすべてコミットされているか
const branch = read('git rev-parse --abbrev-ref HEAD');
if (branch !== 'dev') {
  stop(`dev ブランチで実行してください(今は ${branch})`);
}
if (read('git status --porcelain') !== '') {
  stop('コミットしていない変更があります。コミットしてから反映してください');
}
const commit = read('git rev-parse HEAD');
const shortCommit = commit.slice(0, 7);

// 2. テストとテスト版のビルド
run('npm run test');
run('npm run build:test', { env: { ...process.env, HITOTSUYANE_COMMIT: commit } });

// 3. 本番のデータベースの名前が入っていないこと
const leaked = filesContaining(BUILD_DIR, PROD_DB_NAME);
if (leaked.length > 0) {
  stop(`テスト版のビルドに「${PROD_DB_NAME}」が入っています:${leaked.join(', ')}`);
}

// 4. hitotsuyane-test の中身を入れ替える
if (existsSync(WORK_DIR)) {
  run('git fetch origin', { cwd: WORK_DIR });
  // まだ何も送っていない(空の)リポジトリのときは、取ってくるものがない
  if (read('git ls-remote --heads origin main', { cwd: WORK_DIR }) !== '') {
    run('git checkout -B main origin/main', { cwd: WORK_DIR });
  }
} else {
  run(`git clone ${TEST_REPO_URL} ${WORK_DIR}`);
}
for (const name of readdirSync(WORK_DIR)) {
  if (name !== '.git') {
    rmSync(join(WORK_DIR, name), { recursive: true, force: true });
  }
}
cpSync(BUILD_DIR, WORK_DIR, { recursive: true });
// GitHub Pages に、ファイルをそのまま出すよう伝える
writeFileSync(join(WORK_DIR, '.nojekyll'), '');

run('git checkout -B main', { cwd: WORK_DIR });
run('git add -A', { cwd: WORK_DIR });
if (read('git status --porcelain', { cwd: WORK_DIR }) === '') {
  console.log('\n前回の反映と同じ中身なので、送るものはありません');
  process.exit(0);
}
run(`git commit -m "dev ${shortCommit} から反映"`, { cwd: WORK_DIR });

if (dryRun) {
  console.log(`\n--dry-run のため送っていません(${WORK_DIR} に中身があります)`);
} else {
  run('git push origin main', { cwd: WORK_DIR });
  console.log(`\n反映しました(dev ${shortCommit})。数分後に https://creative-hues.github.io/hitotsuyane-test/ で確かめられます`);
}
