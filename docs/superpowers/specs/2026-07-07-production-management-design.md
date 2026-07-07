# 生産管理機能 設計ドキュメント

## 背景

Geek Sales（営業支援アプリ）に生産管理機能（生産指示・在庫・品質課題）を追加する。既存の営業管理機能（顧客・商談・パイプライン・活動・テリトリー・インシデント）は維持し、両立させる。

`src/pages/dashboard.tsx` と `src/router.tsx` はすでに生産管理ダッシュボード向けに書き換え作業が着手されていたが、参照先のファイル（`production-dashboard.tsx`、`work-orders.tsx`、`inventory.tsx`、`quality.tsx`、`production-service.ts`）が未作成のまま中断していた。本設計はその続きとして、生産管理機能を完成させる。

## スコープ

- Dataverse に生産管理用の新規テーブルを3つ作成する
- 生産管理の型定義・サービス層・フックを既存の営業管理と同じパターンで追加する
- 生産指示・在庫・品質課題の一覧・作成・編集・削除ページ（フルCRUD）を追加する
- 生産管理ダッシュボードページを完成させる
- サイドバーに「生産管理」ナビゲーションカテゴリを追加する

スコープ外:
- 既存の営業管理機能の変更・削除
- 品質課題と生産指示の紐付け（ルックアップ）
- 自動テストの追加（このリポジトリにテスト基盤が存在しないため）

## データモデル（Dataverse テーブル）

### geek_productionorder（生産指示）

| フィールド | 型 | 備考 |
|---|---|---|
| geek_ordernumber | テキスト | 指示番号 |
| geek_productname | テキスト | 製品名 |
| _geek_customerid_value | ルックアップ → geek_customers | 顧客 |
| geek_line | テキスト | 生産ライン |
| geek_duedate | 日付 | 納期 |
| geek_quantity | 整数 | 数量 |
| geek_progress | 整数(0-100) | 進捗率 |
| geek_status | 選択肢 | 設計中/部品調達/組立中/検査待ち/出荷済み/完了 |

### geek_inventoryitem（在庫）

| フィールド | 型 | 備考 |
|---|---|---|
| geek_partnumber | テキスト | 部品番号 |
| geek_partname | テキスト | 部品名 |
| geek_stock | 整数 | 現在庫数 |
| geek_minstock | 整数 | 最小在庫数 |

### geek_qualityissue（品質課題）

| フィールド | 型 | 備考 |
|---|---|---|
| geek_title | テキスト | 課題タイトル |
| geek_category | 選択肢 | 寸法不良/外観不良/機能不良/その他 |
| geek_severity | 選択肢 | 軽微/中程度/重大/致命的 |
| geek_status | 選択肢 | 未着手/対応中/完了 |
| geek_description | 複数行テキスト | 詳細説明 |

いずれのテーブルも `createdon`/`modifiedon` は自動付与。品質課題を生産指示に紐付けるルックアップは、現行のモックデータに存在しないため今回は追加しない。

## アーキテクチャ

既存の営業管理（Customer/Opportunity/Activity/Territory）と同一の階層構造を、生産管理用に独立したファイル群として踏襲する。

```
src/types/production.ts          - 型定義（ProductionOrder, InventoryItem, QualityIssue, *Create, Optionsマップ）
src/services/production-service.ts - CRUD関数（getClient(dataSourcesInfo) を使い回す）
src/hooks/use-production.ts       - React Query フック（useQuery/useMutation + invalidateQueries）
src/pages/production-dashboard.tsx - 生産管理ダッシュボード
src/pages/work-orders.tsx         - 生産指示 CRUD ページ
src/pages/inventory.tsx           - 在庫 CRUD ページ
src/pages/quality.tsx             - 品質課題 CRUD ページ
```

型定義・サービス・フックを営業管理系（`dataverse.ts`/`dataverse-service.ts`/`use-dataverse.ts`）から分離するのは、既存ファイルの肥大化を避け、責務を明確にするため。`src/lib/dataSourcesInfo.ts` への手動変更は不要（`.power/schemas/appschemas/dataSourcesInfo.ts` は新テーブル追加時に自動再生成される）。

## ページ詳細

### production-dashboard.tsx

現在 `dashboard.tsx` に書き換え済みのコード（KPIカード4枚：生産指示数／進行中／在庫アラート／品質課題、ステータス内訳円グラフ、平均進捗率、納期が近い生産指示リスト、在庫アラートリスト、品質課題一覧、ステータス推移棒グラフ）をそのまま `production-dashboard.tsx` に移動する。

### work-orders.tsx（生産指示）

`customers.tsx` を下敷きにした `ListTable` + `FormModal` + `ConfirmDialog` 構成。
- テーブル列: 指示番号、製品名、顧客名、納期、進捗（プログレスバー）、ステータス（バッジ）
- フォーム項目: 指示番号／製品名／顧客（Combobox）／ライン／納期／数量／進捗／ステータス
- フィルタ: ステータス別

### inventory.tsx（在庫）

同パターン。
- テーブル列: 部品番号、部品名、在庫数、最小在庫（在庫 ≤ 最小在庫の行は警告バッジ）
- フォーム項目: 部品番号／部品名／在庫数／最小在庫

### quality.tsx（品質課題）

同パターン。
- テーブル列: タイトル、カテゴリ、重大度（バッジ色分け）、ステータス
- フォーム項目: タイトル／カテゴリ／重大度／ステータス／詳細説明（テキストエリア）

## ナビゲーション統合

`src/router.tsx` は既存の未コミット差分（`production-dashboard`/`work-orders`/`inventory`/`quality` へのルート追加、`dashboard` パスは `production-dashboard.tsx` を表示）をそのまま活かす。

`src/components/sidebar.tsx` に「生産管理」カテゴリを追加する：

```
【概況】
  ダッシュボード（production-dashboard.tsx）
  テリトリー
【生産管理】← 追加
  生産指示 → production-orders
  在庫 → inventory
  品質課題 → quality
【顧客・商談】
  顧客／商談／パイプライン
【活動】
【インシデント】
```

アイコンは lucide-react の `Factory`（生産指示）／`Boxes`（在庫）／`ShieldAlert`（品質課題）を使用する。

## エラーハンドリング

既存パターンをそのまま踏襲する。各CRUD関数は `result.success` をチェックし、失敗時は `throw result.error`。フォーム送信時のエラー通知は既存の `FormModal`／`toast`（sonner）機構を利用し、新規のエラー処理コードは追加しない。

## テスト方針

このリポジトリに自動テスト基盤（Jest/Vitest等）は存在しないため、新規にテストコードは追加しない。実装後は以下で検証する。

- `npm run build`（tsc型チェックを含む）
- `npm run dev` での実機確認: 生産指示・在庫・品質課題それぞれで作成→編集→削除の一連操作、ダッシュボードの数値・グラフへの反映
