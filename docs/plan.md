# 開発計画（初回リリースまで）

初回リリースまでの作業の順序と進捗を管理する。仕様や設計判断は [design.md](design.md) に書く。

- 作業が完了したら、その都度チェックを付けて更新する。
- 初回リリース後は、残った項目を GitHub Issues に移してこのファイルは削除する。

## フェーズ1: プロジェクト基盤

- [x] 開発ツールを決める（ビルドツール、Lint / Formatter）
- [x] `package.json`（`packageManager` で pnpm を固定）/ `tsconfig.json` / ビルド / vitest のセットアップ
- [x] プロトタイプの移植（定義 API を `exports`、CLI を `bin` に分ける）。テスト追加時に vitest の `passWithNoTests` を外す
- [x] DevContainer の PostgreSQL を使った動作確認手順を整える
- [x] `CLAUDE.md` の作成（開発コマンド、design.md / plan.md の参照、plan.md の更新ルール）

## フェーズ2: 不具合修正・改善

- [x] テーブルのコメントをすべて外したときに `IS NULL` が出力されない
- [x] スキーマから消えたカラムに `COMMENT ON COLUMN ... IS NULL` を出力し、migrate が失敗する
- [x] 状態ファイルのキーを DB の種類に依存しない形式にし、引用符は SQL 生成時に付ける（MySQL 対応を見据えて公開前に決める）
- [x] 差分の計算（DB に依存しない変更点）と SQL の生成を分ける
- [x] 識別子に含まれる `"` をエスケープする
- [x] 設定ファイル（`--config`、既定 `drizzle.config.ts`）から `schema` / `out` を読む。`--schema` / `--out` は廃止
- [x] 内部で呼ぶ drizzle-kit に同じ `--config` を渡す
- [x] TypeScript の設定ファイル・スキーマの読み込み方法を決めて対応する
- [x] `public` スキーマの状態キーの扱いを決めて対応する
- [x] `casing` 設定でカラム名を省略した場合の名前解決を確認する（drizzle-kit と名前が一致することをテストで確認）

## フェーズ3: テスト

- [x] 定義 API のユニットテスト（テーブル/カラムコメントの保持、型）
- [x] 差分生成のユニットテスト（追加・変更・削除、テーブル/カラムの消失、エスケープ、enum）
- [x] ビルドした型定義を TypeScript 5.x / 6 / 7 で型チェックし、利用者側の対応バージョンを確認する（5.0 以上）
- [x] PostgreSQL を使った結合テスト（生成 → migrate → `col_description` / `obj_description` で確認）

## フェーズ4: 対応範囲の拡大

- [x] `.comment()` が本ライブラリの読み込み前に呼ばれると失敗する問題（import の削除・読み込み順）への対応として、`.comment()` を使わない API を検討する（`withComment(target, comment)` に置き換えた）
- [x] drizzle-orm v1 への対応方針を決めて、動作確認する（初回リリースは 0.x のみ。v1 の正式リリース後に v1 対応版を出す。design.md の 4 と 7）
- [x] prisma 版にあるオプションのうち、初回リリースに入れるものを決めて実装する（いずれも採用しない。design.md の 4）
- [x] enum の型へのコメント（`COMMENT ON TYPE`）に対応する。あわせて CLI の `--enum` を `--append-enum-values` に改名する

## フェーズ5: 公開

- [x] パッケージ名の決定（`@onozaty/drizzle-db-comments-generator`）。合わせて、プロトタイプ由来の名前（SQL のヘッダー、Symbol キー）を `drizzle-db-comments-generator` に揃える
- [x] README の作成
- [ ] CI（型チェック、Lint、テスト、`test:types`、PostgreSQL を用意して `test:db`）
- [ ] npm 公開

## 初回リリース後

- [ ] drizzle-orm / drizzle-kit v1 の正式リリース後に、v1 だけに対応する新しいメジャーバージョンを出す（design.md の 7 を正式版で確認する）
- [ ] MySQL に対応する。カラムのコメントを付けるために定義全体を書き直す方法の安全性（式の既定値、文字コード・照合順序、生成列など）を検証してから（design.md の 4）
