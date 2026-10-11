# 設計ドキュメント

Drizzle ORM のスキーマに定義したテーブル/カラムコメントから、PostgreSQL の `COMMENT ON` 文を
drizzle-kit のカスタムマイグレーションとして生成するライブラリ。
[prisma-db-comments-generator](https://github.com/onozaty/prisma-db-comments-generator) の Drizzle 版にあたる。

## 1. 背景

- Drizzle（drizzle-kit 0.31 / v1）はテーブル・カラムコメントに対応していない。
  要望 Issue: https://github.com/drizzle-team/drizzle-orm/issues/886 （長期間オープン）
- そのため、コメントを定義する API と、差分から SQL を生成する CLI を本ライブラリで提供する。

## 2. 利用イメージ

```ts
import { serial, text, pgSchema } from "drizzle-orm/pg-core";
import { pgTableWithComment, withComment } from "drizzle-db-comments-generator"; // パッケージ名は未決

export const customers = pgTableWithComment("customers", "顧客", {
  customerId: serial("customer_id").primaryKey().comment("顧客ID"),
  name: text("name").notNull().comment("氏名"),
});

// pgSchema / pgTableCreator の場合
const authTable = withComment(pgSchema("auth").table);
export const users = authTable("users", "ユーザー", { ... });
```

```bash
drizzle-kit generate  # 通常のマイグレーション生成
<CLI>                 # コメント用マイグレーション生成（drizzle.config.ts から schema / out を読む）
drizzle-kit migrate
```

## 3. 仕様

### 3.1 テーブルコメント API

- `pgTableWithComment(name, comment, columns, extraConfig?)`
  - 引数は `pgTable` と同じで、テーブル名の直後にコメントが入る。`columns` はオブジェクト形式・コールバック形式の両方に対応する。
  - 戻り値の型は `pgTable` と同一（`$inferSelect` / `$inferInsert` などがそのまま使える）。
- `withComment(tableFn)`
  - 任意の `PgTableFn`（`pgTable` / `pgSchema("x").table` / `pgTableCreator(...)`）をコメント付き版に変換する。
- コメントは `Symbol.for("generate-db-comments:TableComment")` をキーとしてテーブルオブジェクトに保持する。

### 3.2 カラムコメント API

- 全カラムビルダーに `.comment(text)` を追加する。戻り値は `this` で、前後に他のメソッドをチェーンできる。
- コメントはビルダーの `config.comment` に保存する（ビルド後のカラムの `config` に引き継がれる）。

### 3.3 CLI（コメント用マイグレーション生成）

**入力**

| オプション | 既定値 | 説明 |
|---|---|---|
| `--config <file>` | `drizzle.config.ts` | drizzle-kit の設定ファイル |
| `--name <name>` | `update_comments` | マイグレーション名 |
| `--enum` | なし | enum カラムのコメントに `enum: 名前(値, ...)` を追記する |
| `--dry-run` | なし | SQL を表示するだけでファイルを作らない |

**設定**

- drizzle-kit と同じく、設定ファイルからスキーマの場所（`schema`）と出力先（`out`）を求める。
  - `--config` を省略した場合は、drizzle-kit と同じく `drizzle.config.ts` → `drizzle.config.js` → `drizzle.config.json` の順に探す。
  - `schema` は drizzle-kit と同じ形式（ファイル、ディレクトリ（直下のファイル）、glob、それらの配列）に対応する。
  - `schema` / `out` の相対パスは、drizzle-kit と同じく設定ファイルの場所ではなくカレントディレクトリを基準にする。
  - `out` を省略した場合は drizzle-kit と同じ `drizzle` とする。
  - `dialect` が `postgresql` 以外の場合はエラーにする。
  - `casing`（`snake_case` / `camelCase`）を読み、名前を省略して定義したカラムの DB 上の名前を drizzle-kit と同じく変換する。
- 設定ファイルとスキーマ（TypeScript）は、drizzle-kit と同じ方法（tsx の CommonJS ローダー）で読み込む（4. 設計判断を参照）。
- 内部で呼ぶ `drizzle-kit generate --custom` にも同じ `--config` を渡す。
  スキーマの場所と出力先を drizzle-kit と食い違わせないため、`--schema` / `--out` で個別に指定するオプションは設けない。
- drizzle-kit は `npx` ではなく、プロジェクトにインストールされているものを直接実行する（`npx` は未インストール時にダウンロードしてしまうため）。
- 未知のオプションや値のないオプションはエラーにする。

**状態管理**

- 前回生成時の状態を `<out>/comments-latest.json` に保存し、次回はその状態との差分だけを出力する。
- スキーマ上の **すべてのテーブルとカラム** を記録する。コメントがないものは `null` とし、状態からテーブル/カラムの存在も分かるようにする。
- キー（`schema.table`、スキーマなしは `table`）は検索にだけ使い、SQL はスキーマ名・テーブル名・カラム名の各項目から組み立てる。
  キーに DB 固有の引用符を含めないため、将来 MySQL など他の DB に対応しても形式を変えずに済む。
- キーが重複する別々のテーブル（例: `pgTable("a.b")` と `pgSchema("a").table("b")`）がある場合はエラーにする。同じテーブルを複数回 export しているだけなら問題ない。
- 形式の変更に備えて `version` を持たせる。未知の形式（`version` が異なる・ない）や、中身が壊れた状態ファイルを読み込んだ場合はエラーにする。
- コメントの変更がなくても、テーブル/カラムの削除などで状態が変わった場合は状態ファイルだけを更新する（マイグレーションは作らない）。
  更新しないと、削除したカラムを同じコメントで作り直したときに差分なしと判定され、コメントが付かない。
- 空文字のコメントはコメントなし（`null`）として扱う。

```json
{
  "version": 1,
  "tables": {
    "auth.users": { "schema": "auth", "table": "users", "comment": "Users", "columns": { "id": "User ID", "name": null } },
    "customers": { "table": "customers", "comment": "顧客", "columns": { "customer_id": "顧客ID", "created_at": null } }
  }
}
```

**差分のルール**

| ケース | 出力 |
|---|---|
| コメントの追加・変更 | `COMMENT ON ... IS '<コメント>'` |
| コメントの削除（テーブル/カラムはスキーマに残っている） | `COMMENT ON ... IS NULL` |
| テーブル/カラム自体がスキーマから消えた | 何もしない（DDL の削除でコメントも消えるため） |

- 現在のスキーマにあるテーブル/カラムだけを比較する。テーブルのコメントをすべて外しても、テーブルが残っていれば `IS NULL` を出力する。
- 消えたカラムに `COMMENT ON COLUMN ... IS NULL` を出すと、カラムが存在せず migrate が失敗するため、消えたものは比較しない。
- 差分の計算は DB に依存しない変更点（スキーマ・テーブル・カラム・コメント）として求め、SQL の生成（PostgreSQL）とは分ける。

**出力**

- 変更がなければファイルを作らない。
- `drizzle-kit generate --custom --name=<name>` で空のマイグレーションを作らせ、そこへ SQL を書き込む（journal が正しく更新される）。
- 文の区切りに `--> statement-breakpoint` を入れる。
- 文字列リテラルの `'` は `''` に、識別子の `"` は `""` にエスケープする。
- スキーマなしのテーブルはスキーマを付けずに書く（drizzle-kit が出力する DDL と同じ）。
  drizzle-orm では `pgSchema("public")` がエラーになり、public スキーマのテーブルは必ず `pgTable` で定義されるため、public の表記揺れは起きない。
- 必ず通常の `drizzle-kit generate` の後に実行する（DDL より後にコメントを適用するため）。

## 4. 設計判断と理由

| 決定 | 理由 | 却下した案 |
|---|---|---|
| テーブルコメントは `pgTable` をラップする関数で指定する | ラップなら戻り値の型を `pgTable` と同一にでき、カラム名との衝突もない | `PgTable.prototype.comment()` を追加する案: `comment` という名前のカラムを持つテーブルで、カラムがメソッドを上書きして実行時エラーになる |
| カラムコメントは `ColumnBuilder.prototype` を拡張する（`declare module "drizzle-orm/column-builder"` で型拡張） | カラム関数は種類が多く、すべてをラップするのは現実的でない | カラム関数ごとのラップ |
| コメントは明示的な API で定義する | 確実に取得でき、ビルドや実行環境に依存しない | JSDoc（`/** */`）を TypeScript Compiler API で解析する案: 解析が不確実なうえ、TypeScript 7 は Go 実装で JS の Compiler API がない |
| 差分は状態ファイル（`comments-latest.json`）で管理する | prisma 版と同じ方式。DB に接続せずに差分を出せる | DB から現在のコメントを読み取る案 |
| 出力は drizzle-kit のカスタムマイグレーションに書き込む | drizzle-kit の journal と整合し、`drizzle-kit migrate` でそのまま適用できる | 独自のマイグレーション管理 |
| テーブルコメントのキーに `Symbol.for` を使う | 定義 API と CLI でモジュールのインスタンスが別になってもキーが一致する | モジュールローカルの `Symbol()` |
| 開発は TypeScript 7 で行い、Lint / Formatter は Biome を使う | Biome は TypeScript の JS API に依存せず TypeScript 7 と併用できる。利用者には JS と型定義だけを配布するため、利用者の TypeScript のバージョンは制限しない | TypeScript 6 + ESLint（typescript-eslint）+ Prettier: typescript-eslint が TypeScript 6.0 までしか対応していない |
| 設定ファイルとスキーマは drizzle-kit と同じく tsx の CommonJS ローダー（`tsx/cjs/api` の `register`）と `require` で読み込む | drizzle-kit と同じ読み込み方なので、drizzle-kit が読み込めるスキーマ（拡張子なしの相対 import、tsconfig の paths、`export default` / `module.exports` の設定ファイルなど）はそのまま読み込める。ES module / CommonJS どちらのプロジェクトでも、スキーマと本ライブラリが同じ drizzle-orm（CommonJS 版）を使うため `.comment()` が効く。tsx は drizzle-kit の依存でもあるため、通常は重複しない | tsx の ESM ローダーで `import`: CommonJS のプロジェクトではスキーマが CommonJS 版、本ライブラリが ESM 版の drizzle-orm を使い、`.comment()` が効かない。Node.js の型除去: 拡張子なしの相対 import を解決できない。jiti: drizzle-kit と読み込み方が異なり挙動差が出うる |
| カラム名の `casing` 変換は drizzle-orm の `CasingCache`（`drizzle-orm/casing`）の `getColumnCasing` で行う | drizzle-orm がクエリ生成で使う公開 API で、drizzle-kit と同じ規則（名前を省略したカラムだけを変換する）。変換規則を自前で持たずに済む。drizzle-kit の結果（`drizzle-kit/api` の `generateDrizzleJson`）とテーブル名・カラム名が一致することをテストで確認している | `toSnakeCase` / `toCamelCase` を使って自前で判定する |
| ビルドは tsdown を使う。対応 Node.js は 22 以上 | 型定義を出力でき、`exports` と `bin` をまとめてビルドできる | esbuild（型定義を出力できない）、tsup（後継が tsdown） |
| ライブラリは ESM と CommonJS の両方を出力し（`exports` の `import` / `require` で切り替え、型定義も `.d.mts` / `.d.cts`）、CLI は CommonJS で出力する | drizzle-orm は ESM 版と CommonJS 版を持ち、プロジェクトの種類によってどちらが使われるかが変わる。`.comment()` は使われる側の `ColumnBuilder` に追加する必要があり、型のモジュール拡張も同様。CLI は drizzle-kit と同じく、読み込むスキーマと同じ CommonJS 版の drizzle-orm を共有するため CommonJS にする | ESM のみ: CommonJS のプロジェクトで `.comment()` が実行時・型ともに使えない（Node.js 22 の `require(esm)` で読み込めても、追加先が ESM 版の drizzle-orm になる） |

## 5. 前提・制約

- **drizzle-orm の内部挙動に依存している**
  - ビルダーの `config` オブジェクトが、ビルド後のカラムの `config` にそのまま引き継がれる。
  - drizzle-orm のメジャーバージョンアップ（v1 など）で内部構造が変わると動かなくなる可能性がある。
- **`.comment()` を使うファイルでは、本ライブラリを import する必要がある**
  - `.comment()` は本ライブラリの読み込み時に `ColumnBuilder.prototype` に追加されるため、読み込まれる前にカラムを定義すると `.comment is not a function` になる。
  - `import { pgTableWithComment } from "..."` のように値を import しても、そのファイルで値として使っていなければ（型としてだけ使う場合を含む）、
    TypeScript の変換（tsc / tsx / esbuild など）で import 自体が削除されることがある。
    `verbatimModuleSyntax` を有効にしている場合や、Node.js の型除去で実行する場合は削除されない。
  - 型は `declare module` によるモジュール拡張で付くため、import が削除されても `.comment()` は型エラーにならず、実行時にだけ失敗する（気づきにくい）。
  - import が残っていても、本ライブラリより先に評価されるファイルでは `.comment()` がまだない。
    例えば共通のカラム定義を別ファイル（`columns.helpers.ts` など）に置き、スキーマから本ライブラリより先に import すると、そのファイルで失敗する。
  - そのため、現状は `.comment()` を使う **すべてのファイル** で、副作用だけの import（`import "drizzle-db-comments-generator";`）を書く必要がある。
    この制約は守られなくても気づきにくいため、`.comment()` を使わない API の追加を検討する（plan.md）。
- **drizzle-orm は peerDependencies にする必要がある**
  - `.comment()` は `ColumnBuilder.prototype` に追加するため、利用者のプロジェクトと本ライブラリで drizzle-orm が別インスタンスになると、利用者側のビルダーに `.comment()` が生えない。
- **CLI の動作環境**
  - Yarn PnP では drizzle-kit の実行ファイルが zip 内のパスになるため、`yarn run` 経由（PnP ローダーが有効な状態）でのみ動く。
  - `schema` の glob 展開は drizzle-kit（glob）と異なるライブラリ（tinyglobby）で行うため、Windows のバックスラッシュ区切りのパスなど、細かな挙動が異なる可能性がある。
- **名前の変更とコメントの削除を同じ回の生成で行うと、古いコメントが残る**
  - 状態は DB 上の名前で記録するため、テーブル/カラムの名前の変更（`casing` の変更を含む）は「旧名の削除と新名の追加」として扱う。
    drizzle-kit が RENAME を選んだ場合、PostgreSQL ではコメントが引き継がれるため、同じ回にコメントを削除しても `IS NULL` が出ず、古いコメントが残る。
  - `casing` の変更は多くのカラムの名前を一度に変えるため、特に起きやすい。名前の変更とコメントの削除は別々の回に分けて生成する。
- **同じ回の生成の中での削除と作り直しは検出できない**
  - 状態は生成のたびに比較するため、1回の `drizzle-kit generate` の中でテーブル/カラムが作り直される（DROP と CREATE になる）と、
    コメントが変わっていなければ差分なしとなり、作り直したテーブル/カラムにコメントが付かない。
- **対応する TypeScript は 5.0 以上**
  - 本ライブラリの開発は TypeScript 7 で行うが、利用者には JS と型定義だけを配布するため、利用者の TypeScript は制限しない。
  - ビルドした型定義を 5.0（moduleResolution `bundler` が使える最初のバージョン）/ 5.9 / 6.0 / 7 で型チェックして確認している（`pnpm run test:types`）。
    ESM のプロジェクト（`bundler` / `nodenext`）と CommonJS のプロジェクト（`nodenext`、TypeScript 6 以上は `commonjs` + `bundler` も）で確認している。
  - moduleResolution `node10`（旧 `node`）には対応しない。`exports` を解決できず、TypeScript 6 で非推奨、7 で廃止されているため。
- **コメントは Drizzle の動作に影響しない**
  - コメントは実行時オブジェクトに保持されるだけで、クエリ生成や drizzle-kit の差分検出（スナップショット）には含まれない。

## 6. 動作確認状況

現在の動作確認手順は [development.md](development.md) の「DB を使った動作確認」を参照。

プロトタイプ（PostgreSQL 16、drizzle-orm 0.45.4、drizzle-kit 0.31.11）で、手動で以下を確認済み。

- 初回の全件出力と、migrate による DB への反映（`col_description` / `obj_description` で確認）
- コメントの変更・追加・削除時に差分のみ出力されること、変更がなければファイルを作らないこと
- 複数行コメント、`'` のエスケープ、enum 情報の追記
- `.comment()` / `pgTableWithComment` を使っても `drizzle-kit generate` が「変更なし」になること
- コールバック形式のカラム定義、第3引数（index）、`comment` という名前のカラム、`pgSchema("auth")`
- 型チェック: TS 5.9 / TS 7.0 × moduleResolution `bundler` / `nodenext`。`$inferSelect` / `$inferInsert`、notNull の維持、`.comment()` 前後のメソッドチェーン

## 7. 未決事項

- **パッケージ名**: 第一候補は `drizzle-db-comments-generator`（prisma 版と揃える）。
  他の候補は `drizzle-db-comments`、`@onozaty/drizzle-db-comments-generator`。
  `drizzle-comments` は v1 の SQLcommenter と紛らわしいので避ける。
- **drizzle-orm v1 への対応方針**: v1 は rc（1.0.0-rc.4）まで進んでいる。0.x と v1 のどちらを対象にするか、両対応にするか。
- **対応範囲**: MySQL 対応、prisma 版にあるオプション（`targets`, `ignorePattern`, `ignoreCommentPattern`, `commentRemovePattern`, `commentTransformScript`, enum の detailed 形式）をどこまで入れるか。
