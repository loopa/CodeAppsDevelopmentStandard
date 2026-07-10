# 作業者画面（Worker Screen）設計書

日付: 2026-07-10
ステータス: 承認済み

## 目的

現場作業者がタブレット/スマホから自分の担当生産指示を確認し、工程チェックリストの消化と不具合報告を行える簡易操作画面を追加する。既存の生産指示一覧（work-orders.tsx）は事務所向けの管理画面であり、現場での「今日の自分の仕事を進める」用途には過剰なため、専用画面を設ける。

## ユースケース

- 作業者は共用端末（タブレット等）で作業者一覧から自分の名前を選ぶ。選択は端末の localStorage に保持され、次回以降は自動でその作業者の画面が開く。
- 作業者は自分に割り当てられた進行中の生産指示を一覧で見る。
- 指示を開くと、事務所が指示作成時に設定したチェックリストが表示される。項目をタップしてチェックすると、生産指示の進捗%が「チェック済み件数 ÷ 全項目数」で自動更新される。
- 作業中に不具合を見つけたら、その場で品質課題を登録できる。登録した課題は作業中の生産指示に自動で紐づく。
- 指示のステータス（設計中→部品調達→組立中→検査待ち→出荷済み→完了）も作業者画面から進められる。

## データモデル変更

### 新規テーブル

**geek_worker（作業者マスタ）**

| 列 | 型 | 表示名 |
|---|---|---|
| geek_name | String (primary) | 氏名 |

**geek_checklistitem（チェック項目）**

| 列 | 型 | 表示名 |
|---|---|---|
| geek_name | String (primary) | 項目名 |
| geek_iscompleted | Boolean | 完了 |
| geek_sequence | Integer | 表示順 |
| geek_productionorderid | Lookup → geek_productionorder | 生産指示 |

### 既存テーブルへのルックアップ追加

- `geek_productionorder.geek_workerid` → geek_worker（担当作業者、任意）
- `geek_qualityissue.geek_productionorderid` → geek_productionorder（関連生産指示、任意）

### プロビジョニング

`scripts/setup_dataverse.py` と同じ auth_helper.py ベースの増分スクリプト `scripts/add_worker_tables.py` を作成して実行する。テーブル・ルックアップ作成、日本語ローカライズ、ソリューションメンバーシップ登録を含む。実行後 `pac code`（power-apps CLI）でモデル再生成が必要なら `src/generated/` を更新する。

## 画面構成

### 作業者画面 `/worker`（新規・キオスク風）

既存の Layout（サイドバー・ヘッダー）を使わない独立ルート。大きなタップターゲット・カード中心のUI。3段階のフロー:

1. **作業者選択** — geek_worker の氏名を大きなカードで一覧表示。タップで選択し localStorage（キー例: `worker-id`）に保存。保存済みなら次回以降この画面はスキップ。画面右上に「作業者切替」ボタンを常設。
2. **担当指示一覧** — 選択中の作業者に割り当てられ、かつステータスが「完了」「出荷済み」以外の生産指示をカード表示（指示番号・製品名・納期・進捗バー・ステータス）。タップで詳細へ。該当なしの場合は「担当作業はありません」を表示。
3. **指示詳細（作業画面）** —
   - チェックリストを geek_sequence 順に大きなチェックボックス行で表示。タップで geek_iscompleted をトグル。
   - チェック更新成功後、進捗% = round(チェック済み ÷ 全項目 × 100) を算出して生産指示に PATCH。チェック項目が0件の指示では進捗は自動更新しない。
   - 「不具合を報告」ボタン → タイトル・カテゴリ・重大度・説明の簡易フォームをモーダル表示。登録時に geek_productionorderid を自動設定。
   - ステータス変更ボタン（次工程への遷移）。

### 事務所側の変更

- **work-orders.tsx**: 生産指示フォームに「担当作業者」Select（geek_worker マスタから選択）とチェックリスト編集UI（テキスト入力+追加ボタン、行ごとの削除、表示順は追加順）を追加。編集時は既存チェック項目を読み込んで表示。
- **quality.tsx**: 一覧に「関連指示番号」列を追加（ルックアップの表示のみ、編集は不要）。
- 作業者マスタの登録UIは今回スコープ外。当面はデモデータ投入スクリプトまたは Dataverse 管理画面から登録する。

## 技術構成

- **型**: `src/types/production.ts` に Worker / WorkerRecord / ChecklistItem / ChecklistItemRecord / 各Create型を追加。ProductionOrder に workerId / workerName、QualityIssue に productionOrderId / orderNumber を追加。
- **サービス**: `production-service.ts` に getWorkers / getChecklistItems(orderId) / createChecklistItem / updateChecklistItem / deleteChecklistItem を追加。createQualityIssue / updateProductionOrder は新ルックアップに対応（`@odata.bind`、空値ガードは既存パターン踏襲）。
- **フック**: `use-production.ts` に useWorkers / useChecklistItems / 各mutation フックを追加（React Query、既存パターン踏襲）。
- **ルーティング**: `router.tsx` に Layout の外側の独立ルート `/worker` を追加。
- **進捗自動計算**: クライアント側で算出して PATCH。同時編集は後勝ち（同一指示を複数人が同時更新するケースは稀と判断し、楽観ロック等は導入しない）。

## エラー処理

- 全 mutation に `toast.error` の onError を付与（既存パターン準拠）。
- オフライン・通信エラー時はトースト表示のみ。再送キュー等は作らない（YAGNI）。
- localStorage の worker-id が指す作業者が削除済みの場合は作業者選択画面に戻す。

## 検証

- `tsc --noEmit` 通過。
- dev サーバーを起動し、Playwright で以下のスモークフローを確認:
  1. `/worker` で作業者を選択 → localStorage 保持を確認
  2. 担当指示一覧の表示
  3. チェック項目のトグル → 進捗%が自動更新されること
  4. 不具合報告 → 品質課題が生産指示に紐づいて作成されること
  5. 事務所側 work-orders.tsx でチェックリスト・担当作業者を設定できること

## スコープ外

- 作業者マスタの管理UI（登録・編集・削除）
- 作業者ごとの認証（共用端末前提のため名前選択のみ）
- 工数・勤怠の記録
- チェックリストのテンプレート機能
- オフライン対応・再送キュー
