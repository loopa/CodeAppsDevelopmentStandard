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

### 追記（2026-07-08）: 接続先Dataverse環境にテーブルが1つも存在しないことが判明

実装プラン作成時に接続先環境（`org3be00c11.crm7.dynamics.com` / kiso masaki の環境）を `pac env fetch` で直接確認したところ、`geek_` プレフィックスのパブリッシャーもテーブルも1つも存在しないことが判明した。つまり `customers.tsx` 等が参照する既存の営業管理テーブル（`geek_customer`/`geek_opportunity`/`geek_activity`/`geek_territory`/`geek_newsinsight`/`geek_incident`）はコード上は完成しているが、この環境ではまだ一度も作成されていない。

ユーザーと協議の結果、**営業管理・生産管理の両方のテーブルを今回まとめて作成する**方針とした。理由: 生産管理機能だけ作っても、顧客ルックアップの参照先である `geek_customer` が無ければ動作確認できず、アプリ全体が実際に機能する状態にならないため。

このため、上記スコープを以下の通り拡張する。

**追加スコープ:**
- 新規パブリッシャー（プレフィックス `geek`）と新規ソリューションを Dataverse に作成する
- 生産管理3テーブルに加え、既存コードが前提とする営業管理6テーブル（顧客・商談・活動履歴・テリトリー・ニュースインサイト・インシデント）も新規作成する
- 各テーブルのフィールド定義は既存の `src/types/dataverse.ts`・`src/types/incident.ts` の型定義から逆算する（コードは変更しない。テーブル側をコードに合わせる）

**スコープ外（変更なし）:** 既存の営業管理ページ（`customers.tsx` 等）のコード変更、品質課題と生産指示の紐付け、自動テスト追加。

#### 営業管理6テーブルの定義（コードから逆算）

**geek_customer**（主キー表示名: geek_name）
| フィールド | 型 |
|---|---|
| geek_industry | 選択肢（IndustryOptions: 製造/IT/商社/小売/金融/その他） |
| geek_contactperson | テキスト |
| geek_email | テキスト(Email) |
| geek_phone | テキスト |
| geek_address | テキスト |
| geek_notes | 複数行テキスト |

**geek_opportunity**（主キー表示名: geek_name）
| フィールド | 型 |
|---|---|
| geek_stage | 選択肢（StageOptions: リード/提案/見積/交渉/受注/失注/キャンセル） |
| geek_amount | 通貨 |
| geek_probability | 整数 |
| geek_expectedclosedate | 日付 |
| geek_description | 複数行テキスト |
| geek_aiinsights | 複数行テキスト |
| _geek_customerid_value | ルックアップ → geek_customer |

**geek_activity**（主キー表示名: geek_name）
| フィールド | 型 |
|---|---|
| geek_type | 選択肢（ActivityTypeOptions: 訪問/電話/メール/オンライン会議/その他） |
| geek_activitydate | 日付 |
| geek_content | 複数行テキスト |
| geek_nextaction | 複数行テキスト |
| _geek_customerid_value | ルックアップ → geek_customer |
| _geek_opportunityid_value | ルックアップ → geek_opportunity |

**geek_territory**（主キー表示名: geek_name）
| フィールド | 型 |
|---|---|
| geek_budget | 通貨（geek_budget_baseは通貨列の自動生成フィールドのため作成不要） |
| geek_fiscalyear | 整数 |
| geek_notes | 複数行テキスト |
| _geek_customerid_value | ルックアップ → geek_customer |
| （ownerid は UserOwned テーブルの自動システムフィールド） |

**geek_newsinsight**（主キー表示名: geek_headline）
| フィールド | 型 |
|---|---|
| geek_summary | 複数行テキスト |
| geek_action | 複数行テキスト |
| geek_impact | 整数 |
| geek_category | テキスト |
| geek_relatedcustomers | テキスト |
| geek_generateddate | 日付 |

**geek_incident**（主キー表示名: geek_title）
| フィールド | 型 |
|---|---|
| geek_description | 複数行テキスト |
| geek_status | 選択肢（新規/対応中/解決済/クローズ） |
| geek_priority | 選択肢（低/中/高/緊急） |
| geek_assettype | 選択肢（PC/サーバー/プリンター/ネットワーク機器/モバイルデバイス/ソフトウェア/その他） |
| geek_assetstatus | 選択肢（稼働中/故障中/メンテナンス中/廃棄済） |
| geek_reportedby | テキスト |
| geek_assignedto | テキスト |
| geek_resolvedon | 日付 |
| geek_resolution | 複数行テキスト |

#### 生産管理3テーブルの主キー表示名（訂正）

先述の3テーブルの主キー（プライマリネーム属性）を明記する: `geek_productionorder` は `geek_ordernumber`、`geek_inventoryitem` は `geek_partnumber`、`geek_qualityissue` は `geek_title` を使う（いずれも `geek_name` ではない）。

#### テーブル作成順序（依存関係）

1. Tier 0（依存なし）: geek_customer, geek_inventoryitem, geek_qualityissue, geek_newsinsight, geek_incident
2. Tier 1（Tier 0 に依存）: geek_opportunity（→customer）, geek_territory（→customer）, geek_productionorder（→customer）
3. Tier 2（Tier 1 に依存）: geek_activity（→customer, →opportunity）

#### 使用ツール

`.github/skills/dataverse/scripts/setup_dataverse.py` テンプレートと `.github/skills/standard/scripts/auth_helper.py`（DeviceCodeCredential による Python 認証、Azure CLI 不要）を使う。この環境には PowerShell も Azure CLI も無いため、`code-apps-preview:add-dataverse` スキルの PowerShell 手順ではなく、このリポジトリ専用の Python スクリプトを使う。

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
