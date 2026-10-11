# 開発ガイド

## 開発環境

DevContainer（`.devcontainer/`）で開発する。

- Node.js 24、pnpm（バージョンは `package.json` の `packageManager` で固定。corepack が自動で用意する）
- PostgreSQL 18（`localhost:5432`、ユーザー `db_user` / パスワード `db_password` / DB `sample`）

## コマンド

| コマンド | 内容 |
|---|---|
| `pnpm install` | 依存パッケージのインストール |
| `pnpm run build` | ビルド（`dist/` に出力） |
| `pnpm test` | ユニットテスト |
| `pnpm run test:cov` | カバレッジ付きでユニットテスト |
| `pnpm run lint` | Lint とフォーマットのチェック（Biome） |
| `pnpm run format` | Lint の自動修正とフォーマット（Biome） |
| `pnpm run typecheck` | 型チェック（`src/` と `example/`） |
| `pnpm run check` | `lint` と `typecheck` をまとめて実行 |

## DB を使った動作確認

`example/` のスキーマを使い、DevContainer の PostgreSQL で「生成 → 反映 → 確認」を行う。

| ファイル | 内容 |
|---|---|
| `example/schema.ts` | 動作確認用のスキーマ。パッケージ名で import するため、実行時はビルド結果（`dist/`）が使われる |
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
