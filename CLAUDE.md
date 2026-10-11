# CLAUDE.md

Drizzle ORM のスキーマに定義したテーブル/カラムコメントから、PostgreSQL の `COMMENT ON` 文を
drizzle-kit のカスタムマイグレーションとして生成するライブラリ。

## ドキュメント

作業前に必要なものを読むこと。

- [docs/design.md](docs/design.md): 仕様、設計判断と理由、前提・制約、未決事項
- [docs/plan.md](docs/plan.md): 初回リリースまでの開発計画と進捗
- [docs/development.md](docs/development.md): 開発環境、コマンド、DB を使った動作確認手順

## ルール

- **plan.md を更新する**: plan.md の項目に当たる作業を完了したら、同じコミットでチェックを付ける。作業中に新たな課題が見つかったら項目を追加する。
- **design.md を更新する**: 仕様や設計判断を変えたら design.md に反映する。未決事項が決まったら、仕様・設計判断に移して未決事項から外す。
- **コミット前に確認する**: `pnpm run check` と `pnpm test` が通ること。CLI や生成 SQL に関わる変更は、docs/development.md の手順で DB への反映も確認する。
- **公開 API を意識する**: `src/index.ts` から export するものが公開 API になる。追加・変更する場合は design.md の仕様と合わせる。
- **drizzle-orm の内部挙動に依存している箇所**（`ColumnBuilder.prototype` の拡張、`config.comment`）は `src/comment.ts` に集める。
