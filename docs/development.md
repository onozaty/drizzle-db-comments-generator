# 開発ガイド

## 開発環境

DevContainer（`.devcontainer/`）で開発する。

- Node.js 24、pnpm（バージョンは `package.json` の `packageManager` で固定。corepack が自動で用意する）
- PostgreSQL 18（`localhost:5432`、ユーザー `db_user` / パスワード `db_password` / DB `sample`）
- pgAdmin（VS Code の「ポート」タブで、ラベル `pgAdmin`（5050）の転送先アドレスをブラウザで開く。サーバー `sample` は登録済みで、初回接続時にパスワード `db_password` を入力する）

## コマンド

| コマンド | 内容 |
|---|---|
| `pnpm install` | 依存パッケージのインストール |
| `pnpm run build` | ビルド（`dist/` に出力） |
| `pnpm test` | テスト（ビルドした CLI とライブラリを ESM・CommonJS の一時的なプロジェクトで実行するテストを含むため、ビルドも行う） |
| `pnpm run test:cov` | カバレッジ付きでユニットテスト |
| `pnpm run test:types` | ビルドした型定義を、対応する各バージョンの TypeScript（5.0 / 5.9 / 6.0 / 7）で、ESM と CommonJS のプロジェクトそれぞれから型チェックする（`type-tests/`）。1 分ほどかかるため `pnpm test` とは別 |
| `pnpm run test:db` | PostgreSQL を使った結合テスト（`test/*.db.test.ts`）。一時的なプロジェクトで drizzle-kit generate → CLI → drizzle-kit migrate を実行し、DB のコメントを確認する。接続先は環境変数 `TEST_DATABASE_URL`（既定は DevContainer の DB）で、テストごとに専用のデータベースを作成・削除する |
| `pnpm run lint` | Lint とフォーマットのチェック（Biome） |
| `pnpm run format` | Lint の自動修正とフォーマット（Biome） |
| `pnpm run typecheck` | 型チェック（`src/`、`example/`、`type-tests/`） |
| `pnpm run check` | `lint` と `typecheck` をまとめて実行 |

## テストの構成

| 場所 | 内容 | 実行 |
|---|---|---|
| `src/*.test.ts` | ソースを直接読み込む単体テスト | `pnpm test` |
| `test/*.test.ts` | ビルドした CLI・ライブラリ（`dist/`）を、ESM・CommonJS の一時的なプロジェクトで実行するテスト | `pnpm test` |
| `test/*.db.test.ts` | PostgreSQL を使った結合テスト | `pnpm run test:db` |
| `test/helpers/` | 一時的なプロジェクトの作成など、`test/` のテストの共通処理 | - |
| `type-tests/` | 公開 API の型のテスト | `pnpm run typecheck`（ソースに対して）、`pnpm run test:types`（ビルドした型定義に対して） |

`test/` のテストは `dist/` を使うため、テストの実行前に一度だけビルドする（`test/global-setup.ts`）。

## DB を使った動作確認

`example/` のスキーマを使い、DevContainer の PostgreSQL で「生成 → 反映 → 確認」を行う。

| ファイル | 内容 |
|---|---|
| `example/schema.ts` | 動作確認用のスキーマ。パッケージ名で import するため、実行時はビルド結果（`dist/`）が使われる |
| `example/enums.ts` | `schema.ts` から拡張子なしの相対パスで import する enum。drizzle-kit と同じ方法でスキーマを読み込めることの確認を兼ねる |
| `example/drizzle.config.ts` | drizzle-kit の設定。接続先は環境変数 `EXAMPLE_DATABASE_URL` で変更できる |
| `example/drizzle/` | 生成されたマイグレーションと状態ファイル（git 管理外） |

- 型チェック（`pnpm run typecheck`）では、`example/tsconfig.json` の `paths` でパッケージ名を `src/` に向けている。
  実行時は `dist/` が使われるので、`src/` を変更したらビルドを含む `example:generate` からやり直す。
- `example/` のスクリプトは Node.js の型除去機能で TypeScript のまま実行する（Node.js 24 前提）。

### 手順

```bash
pnpm run example:reset     # DB とマイグレーションを初期状態に戻す（接続先の public / drizzle スキーマを削除する）
pnpm run example:generate  # ビルド → drizzle-kit generate → コメント用マイグレーション生成
pnpm run example:migrate   # マイグレーションを DB に反映
pnpm run example:show      # DB に入っているテーブル/カラムコメントを表示
```

差分の動作を確認するときは、`example/schema.ts` のコメントを変更してから `example:generate` → `example:migrate` → `example:show` を繰り返す。
確認が終わったら `example/schema.ts` を元に戻し、`example:reset` で初期状態に戻す。
