# 生産管理機能 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dataverse に営業管理6テーブル+生産管理3テーブルを新規作成し、生産管理（生産指示・在庫・品質課題）のCRUD画面とダッシュボードを完成させる。

**Architecture:** 既存の営業管理（Customer/Opportunity/Activity/Territory）と同一の階層構造（型定義→サービス層→React Queryフック→ページ）を生産管理に踏襲する。Dataverseテーブルは `.github/skills/dataverse/scripts/setup_dataverse.py` テンプレート（Python + DeviceCodeCredential認証）で一括作成する。

**Tech Stack:** React 19 + TypeScript + Vite, `@microsoft/power-apps` SDK（`getClient`）, TanStack Query, react-router-dom, shadcn/ui, recharts, Python 3.10+ (azure-identity, requests, python-dotenv) for Dataverse schema provisioning.

## Global Constraints

- パブリッシャープレフィックスは `geek`（この環境には存在しないため新規作成）
- Choice（Picklist）の値は `100000000` から開始する
- 顧客ロール参照など既存の値ラベルは `src/types/dataverse.ts` / `src/types/incident.ts` に定義済みの数値と完全一致させる（コード側は変更しない）
- テーブル作成はマスタ→主→従属の順（Tier 0 → Tier 1 → Tier 2）で行う
- `npx power-apps push`（本番デプロイ）は本プランの範囲外。`npm run dev` によるローカル確認までとする
- 環境情報: `DATAVERSE_URL=https://org3be00c11.crm7.dynamics.com/`, `TENANT_ID=d0267bc1-69a8-451a-b807-4cda2ae24fef`, `ENVIRONMENT_ID=773948ed-0074-e157-805c-22d7fe9b1bb5`

---

### Task 1: Power Platform コードアプリの初期化

**Files:**
- Create: `power.config.json`（`npx power-apps init` が自動生成）

**Interfaces:**
- Consumes: なし
- Produces: `power.config.json`（`environmentId` を含む）。Task 4 のデータソース登録が依存する。

- [ ] **Step 1: バージョン確認**

Run: `node --version && npm --version`
Expected: Node v18+ が表示される（既に確認済み: npm install 成功済み）

- [ ] **Step 2: power-apps init 実行**

Run:
```bash
npx power-apps init -n 'Geek Sales' -e 773948ed-0074-e157-805c-22d7fe9b1bb5 --non-interactive
```

初回実行時にブラウザでサインインを求められる場合がある。完了までブラウザの認証を進める。

Expected: コマンドが正常終了し、`power.config.json` が作成される。

- [ ] **Step 3: power.config.json の内容確認**

Run: `cat power.config.json`
Expected: JSON内に `"environmentId": "773948ed-0074-e157-805c-22d7fe9b1bb5"` が含まれる。含まれていない場合は init をやり直す。

- [ ] **Step 4: ベースラインビルド確認**

Run: `npm run build`
Expected: `dist/` フォルダが生成され、ビルドが成功する（既存コードは `production-service.ts` 等未作成ファイルへの参照でこの時点ではまだ失敗する可能性がある — その場合はエラー内容が「モジュールが見つからない」系であることのみ確認し、次のタスクへ進む）。

- [ ] **Step 5: コミット**

```bash
git add power.config.json
git commit -m "chore: initialize Power Platform code app connection"
```

---

### Task 2: Dataverse 認証基盤のセットアップ

**Files:**
- Create: `scripts/auth_helper.py`（`.github/skills/standard/scripts/auth_helper.py` をコピー）
- Create: `scripts/setup_dataverse.py`（`.github/skills/dataverse/scripts/setup_dataverse.py` をコピーしてカスタマイズ、Task 3で編集）
- Create: `.env`（`.env.example` を参考に作成、gitignore対象）
- Create: `scripts/requirements.txt`

**Interfaces:**
- Consumes: なし
- Produces: `scripts/auth_helper.py` の `api_get/api_post/api_patch/api_delete/api_request/retry_metadata/get_token` 関数。Task 3 が `from auth_helper import ...` で使用する。

- [ ] **Step 1: スクリプトをコピー**

Run:
```bash
cp .github/skills/standard/scripts/auth_helper.py scripts/auth_helper.py
cp .github/skills/dataverse/scripts/setup_dataverse.py scripts/setup_dataverse.py
cp .github/skills/standard/scripts/requirements.txt scripts/requirements.txt
```

Expected: 3ファイルが `scripts/` にコピーされる。

- [ ] **Step 2: .env を作成**

`.env.example` の該当項目を参考に、プロジェクトルートに `.env` を作成する（Write toolで新規作成、既存の `.env.example` の全項目のうち今回使う4項目のみ設定すればよい）:

```bash
DATAVERSE_URL=https://org3be00c11.crm7.dynamics.com/
TENANT_ID=d0267bc1-69a8-451a-b807-4cda2ae24fef
SOLUTION_NAME=GeekFactoryDX
SOLUTION_DISPLAY_NAME=Geek Factory DX
PUBLISHER_PREFIX=geek
PAC_AUTH_PROFILE=factory-auth
```

Expected: `.env` がプロジェクトルートに存在する（`.gitignore` により追跡対象外）。

- [ ] **Step 3: Python 仮想環境と依存関係のセットアップ**

Run:
```bash
cd scripts && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt && cd ..
```
Expected: エラーなく完了する。`scripts/.venv/` が作成される。

- [ ] **Step 4: geek パブリッシャーを作成**

この環境には `geek` プレフィックスのパブリッシャーが存在しないため、`setup_dataverse.py` の `ensure_solution()` を実行する前に作成する。以下のワンショットスクリプトを一時的に作成して実行する。

Write `scripts/create_publisher.py`:
```python
import sys
sys.path.insert(0, ".")
from auth_helper import api_get, api_post

existing = api_get("publishers?$filter=customizationprefix eq 'geek'&$select=publisherid")
if existing.get("value"):
    print("Publisher 'geek' already exists:", existing["value"][0]["publisherid"])
else:
    new_id = api_post("publishers", {
        "uniquename": "geekfactorydx",
        "friendlyname": "Geek Factory DX Publisher",
        "customizationprefix": "geek",
        "customizationoptionvalueprefix": 10000,
    })
    print("Created publisher 'geek':", new_id)
```

Run: `cd scripts && .venv/bin/python create_publisher.py && cd ..`

初回実行時、ターミナルにデバイスコード認証のURLとコードが表示される。表示された `https://microsoft.com/devicelogin` をブラウザで開き、コードを入力してサインインを完了する。

Expected: `Created publisher 'geek': <guid>` または `Publisher 'geek' already exists: <guid>` が出力される。`.auth_record.json` が `scripts/` に作成され、以降の実行では再認証が不要になる。

- [ ] **Step 5: コミット**

```bash
git add scripts/auth_helper.py scripts/setup_dataverse.py scripts/requirements.txt scripts/create_publisher.py
git commit -m "chore: add Dataverse provisioning scripts"
```

`.env` と `.auth_record.json` は `.gitignore` 対象のためコミットしない（`git status` で追跡対象外になっていることを確認する）。

---

### Task 3: Dataverse テーブル一括作成（営業6テーブル+生産3テーブル）

**Files:**
- Modify: `scripts/setup_dataverse.py`

**Interfaces:**
- Consumes: `scripts/auth_helper.py` の `api_get/api_post/retry_metadata` 等（Task 2 で用意済み）
- Produces: Dataverse 上に9テーブル（`geek_customer`, `geek_opportunity`, `geek_activity`, `geek_territory`, `geek_newsinsight`, `geek_incident`, `geek_productionorder`, `geek_inventoryitem`, `geek_qualityissue`）。Task 4（データソース登録）と Task 6（サービス層実装）が、ここで確定する論理名・列名に依存する。

このテーブルは主キー（プライマリネーム属性）がテーブルごとに異なる（`geek_name` 以外を使うテーブルがある）。テンプレートの `create_tables()` はプライマリ属性名を `f"{PREFIX}_name"` に固定しているため、まずこの関数をテーブルごとに指定可能な形に修正する。

- [ ] **Step 1: create_tables() をプライマリ属性可変対応に修正**

`scripts/setup_dataverse.py` の `create_tables()` 関数内、`_create` のボディ定義を以下のように変更する。

Old:
```python
        def _create(t=tbl):
            body = {
                "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
                "SchemaName": t["logical"],
                "DisplayName": label_jp(t["display"]),
                "DisplayCollectionName": label_jp(t["plural"]),
                "Description": label_jp(t["description"]),
                "OwnershipType": "UserOwned",
                "IsActivity": False,
                "HasActivities": False,
                "HasNotes": False,
                "HasFeedback": False,
                "PrimaryNameAttribute": f"{PREFIX}_name",
                "Attributes": [
                    {
                        "@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
                        "SchemaName": f"{PREFIX}_name",
                        "DisplayName": label_jp("Name"),
                        "IsPrimaryName": True,
                        "RequiredLevel": {"Value": "ApplicationRequired"},
                        "FormatName": {"Value": "Text"},
                        "MaxLength": 200,
                    }
                ],
            }
```

New:
```python
        def _create(t=tbl):
            primary_schema = t.get("primary_schema", f"{PREFIX}_name")
            primary_display = t.get("primary_display", "Name")
            body = {
                "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
                "SchemaName": t["logical"],
                "DisplayName": label_jp(t["display"]),
                "DisplayCollectionName": label_jp(t["plural"]),
                "Description": label_jp(t["description"]),
                "OwnershipType": "UserOwned",
                "IsActivity": False,
                "HasActivities": False,
                "HasNotes": False,
                "HasFeedback": False,
                "PrimaryNameAttribute": primary_schema,
                "Attributes": [
                    {
                        "@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
                        "SchemaName": primary_schema,
                        "DisplayName": label_jp(primary_display),
                        "IsPrimaryName": True,
                        "RequiredLevel": {"Value": "ApplicationRequired"},
                        "FormatName": {"Value": "Text"},
                        "MaxLength": 200,
                    }
                ],
            }
```

- [ ] **Step 2: TABLES / LOOKUPS / LOCALIZE_* を全面差し替え**

`scripts/setup_dataverse.py` の `TABLES = [...]` から `LOCALIZE_OPTIONS = [...]` までのプロジェクト固有ブロック全体（テンプレートのコメントアウトされたサンプルを含む）を、以下の内容に置き換える。

```python
TABLES = [
    # ── Tier 0: 依存なし ──
    {
        "logical": f"{PREFIX}_customer",
        "display": "Customer",
        "plural": "Customers",
        "description": "顧客マスタ",
        "columns": [
            {"logical": f"{PREFIX}_industry", "type": "Picklist", "display": "Industry",
             "options": [
                 (100000000, "製造"), (100000001, "IT"), (100000002, "商社"),
                 (100000003, "小売"), (100000004, "金融"), (100000005, "その他"),
             ]},
            {"logical": f"{PREFIX}_contactperson", "type": "String", "display": "Contact Person", "maxLength": 100},
            {"logical": f"{PREFIX}_email", "type": "String", "display": "Email", "maxLength": 100},
            {"logical": f"{PREFIX}_phone", "type": "String", "display": "Phone", "maxLength": 30},
            {"logical": f"{PREFIX}_address", "type": "String", "display": "Address", "maxLength": 200},
            {"logical": f"{PREFIX}_notes", "type": "Memo", "display": "Notes", "maxLength": 2000},
        ],
    },
    {
        "logical": f"{PREFIX}_inventoryitem",
        "display": "Inventory Item",
        "plural": "Inventory Items",
        "description": "在庫マスタ",
        "primary_schema": f"{PREFIX}_partnumber",
        "primary_display": "Part Number",
        "columns": [
            {"logical": f"{PREFIX}_partname", "type": "String", "display": "Part Name", "maxLength": 200},
            {"logical": f"{PREFIX}_stock", "type": "Integer", "display": "Stock"},
            {"logical": f"{PREFIX}_minstock", "type": "Integer", "display": "Min Stock"},
        ],
    },
    {
        "logical": f"{PREFIX}_qualityissue",
        "display": "Quality Issue",
        "plural": "Quality Issues",
        "description": "品質課題",
        "primary_schema": f"{PREFIX}_title",
        "primary_display": "Title",
        "columns": [
            {"logical": f"{PREFIX}_category", "type": "Picklist", "display": "Category",
             "options": [
                 (100000000, "寸法不良"), (100000001, "外観不良"),
                 (100000002, "機能不良"), (100000003, "その他"),
             ]},
            {"logical": f"{PREFIX}_severity", "type": "Picklist", "display": "Severity",
             "options": [
                 (100000000, "軽微"), (100000001, "中程度"),
                 (100000002, "重大"), (100000003, "致命的"),
             ]},
            {"logical": f"{PREFIX}_status", "type": "Picklist", "display": "Status",
             "options": [
                 (100000000, "未着手"), (100000001, "対応中"), (100000002, "完了"),
             ]},
            {"logical": f"{PREFIX}_description", "type": "Memo", "display": "Description", "maxLength": 2000},
        ],
    },
    {
        "logical": f"{PREFIX}_newsinsight",
        "display": "News Insight",
        "plural": "News Insights",
        "description": "ニュースインサイト",
        "primary_schema": f"{PREFIX}_headline",
        "primary_display": "Headline",
        "columns": [
            {"logical": f"{PREFIX}_summary", "type": "Memo", "display": "Summary", "maxLength": 2000},
            {"logical": f"{PREFIX}_action", "type": "Memo", "display": "Action", "maxLength": 2000},
            {"logical": f"{PREFIX}_impact", "type": "Integer", "display": "Impact"},
            {"logical": f"{PREFIX}_category", "type": "String", "display": "Category", "maxLength": 100},
            {"logical": f"{PREFIX}_relatedcustomers", "type": "String", "display": "Related Customers", "maxLength": 400},
            {"logical": f"{PREFIX}_generateddate", "type": "DateTime", "display": "Generated Date", "format": "DateOnly"},
        ],
    },
    {
        "logical": f"{PREFIX}_incident",
        "display": "Incident",
        "plural": "Incidents",
        "description": "インシデント",
        "primary_schema": f"{PREFIX}_title",
        "primary_display": "Title",
        "columns": [
            {"logical": f"{PREFIX}_description", "type": "Memo", "display": "Description", "maxLength": 2000},
            {"logical": f"{PREFIX}_status", "type": "Picklist", "display": "Status",
             "options": [
                 (100000000, "新規"), (100000001, "対応中"),
                 (100000002, "解決済"), (100000003, "クローズ"),
             ]},
            {"logical": f"{PREFIX}_priority", "type": "Picklist", "display": "Priority",
             "options": [
                 (100000000, "低"), (100000001, "中"), (100000002, "高"), (100000003, "緊急"),
             ]},
            {"logical": f"{PREFIX}_assettype", "type": "Picklist", "display": "Asset Type",
             "options": [
                 (100000000, "PC"), (100000001, "サーバー"), (100000002, "プリンター"),
                 (100000003, "ネットワーク機器"), (100000004, "モバイルデバイス"),
                 (100000005, "ソフトウェア"), (100000006, "その他"),
             ]},
            {"logical": f"{PREFIX}_assetstatus", "type": "Picklist", "display": "Asset Status",
             "options": [
                 (100000000, "稼働中"), (100000001, "故障中"),
                 (100000002, "メンテナンス中"), (100000003, "廃棄済"),
             ]},
            {"logical": f"{PREFIX}_reportedby", "type": "String", "display": "Reported By", "maxLength": 100},
            {"logical": f"{PREFIX}_assignedto", "type": "String", "display": "Assigned To", "maxLength": 100},
            {"logical": f"{PREFIX}_resolvedon", "type": "DateTime", "display": "Resolved On", "format": "DateOnly"},
            {"logical": f"{PREFIX}_resolution", "type": "Memo", "display": "Resolution", "maxLength": 2000},
        ],
    },
    # ── Tier 1: geek_customer に依存 ──
    {
        "logical": f"{PREFIX}_opportunity",
        "display": "Opportunity",
        "plural": "Opportunities",
        "description": "商談",
        "columns": [
            {"logical": f"{PREFIX}_stage", "type": "Picklist", "display": "Stage",
             "options": [
                 (100000000, "リード"), (100000001, "提案"), (100000002, "見積"),
                 (100000003, "交渉"), (100000004, "受注"), (100000005, "失注"), (100000006, "キャンセル"),
             ]},
            {"logical": f"{PREFIX}_amount", "type": "Money", "display": "Amount"},
            {"logical": f"{PREFIX}_probability", "type": "Integer", "display": "Probability"},
            {"logical": f"{PREFIX}_expectedclosedate", "type": "DateTime", "display": "Expected Close Date", "format": "DateOnly"},
            {"logical": f"{PREFIX}_description", "type": "Memo", "display": "Description", "maxLength": 2000},
            {"logical": f"{PREFIX}_aiinsights", "type": "Memo", "display": "AI Insights", "maxLength": 4000},
        ],
    },
    {
        "logical": f"{PREFIX}_territory",
        "display": "Territory",
        "plural": "Territories",
        "description": "テリトリー",
        "columns": [
            {"logical": f"{PREFIX}_budget", "type": "Money", "display": "Budget"},
            {"logical": f"{PREFIX}_fiscalyear", "type": "Integer", "display": "Fiscal Year"},
            {"logical": f"{PREFIX}_notes", "type": "Memo", "display": "Notes", "maxLength": 2000},
        ],
    },
    {
        "logical": f"{PREFIX}_productionorder",
        "display": "Production Order",
        "plural": "Production Orders",
        "description": "生産指示",
        "primary_schema": f"{PREFIX}_ordernumber",
        "primary_display": "Order Number",
        "columns": [
            {"logical": f"{PREFIX}_productname", "type": "String", "display": "Product Name", "maxLength": 200},
            {"logical": f"{PREFIX}_line", "type": "String", "display": "Line", "maxLength": 100},
            {"logical": f"{PREFIX}_duedate", "type": "DateTime", "display": "Due Date", "format": "DateOnly"},
            {"logical": f"{PREFIX}_quantity", "type": "Integer", "display": "Quantity"},
            {"logical": f"{PREFIX}_progress", "type": "Integer", "display": "Progress", "minValue": 0, "maxValue": 100},
            {"logical": f"{PREFIX}_status", "type": "Picklist", "display": "Status",
             "options": [
                 (100000000, "設計中"), (100000001, "部品調達"), (100000002, "組立中"),
                 (100000003, "検査待ち"), (100000004, "出荷済み"), (100000005, "完了"),
             ]},
        ],
    },
    # ── Tier 2: geek_customer と geek_opportunity に依存 ──
    {
        "logical": f"{PREFIX}_activity",
        "display": "Activity",
        "plural": "Activities",
        "description": "活動履歴",
        "columns": [
            {"logical": f"{PREFIX}_type", "type": "Picklist", "display": "Type",
             "options": [
                 (100000000, "訪問"), (100000001, "電話"), (100000002, "メール"),
                 (100000003, "オンライン会議"), (100000004, "その他"),
             ]},
            {"logical": f"{PREFIX}_activitydate", "type": "DateTime", "display": "Activity Date", "format": "DateOnly"},
            {"logical": f"{PREFIX}_content", "type": "Memo", "display": "Content", "maxLength": 2000},
            {"logical": f"{PREFIX}_nextaction", "type": "Memo", "display": "Next Action", "maxLength": 1000},
        ],
    },
]

LOOKUPS = [
    {"schema": f"{PREFIX}_opportunity_{PREFIX}_customer",
     "referencing": f"{PREFIX}_opportunity", "referenced": f"{PREFIX}_customer",
     "lookup_attr": f"{PREFIX}_customerid", "lookup_display": "Customer"},
    {"schema": f"{PREFIX}_territory_{PREFIX}_customer",
     "referencing": f"{PREFIX}_territory", "referenced": f"{PREFIX}_customer",
     "lookup_attr": f"{PREFIX}_customerid", "lookup_display": "Customer"},
    {"schema": f"{PREFIX}_productionorder_{PREFIX}_customer",
     "referencing": f"{PREFIX}_productionorder", "referenced": f"{PREFIX}_customer",
     "lookup_attr": f"{PREFIX}_customerid", "lookup_display": "Customer"},
    {"schema": f"{PREFIX}_activity_{PREFIX}_customer",
     "referencing": f"{PREFIX}_activity", "referenced": f"{PREFIX}_customer",
     "lookup_attr": f"{PREFIX}_customerid", "lookup_display": "Customer"},
    {"schema": f"{PREFIX}_activity_{PREFIX}_opportunity",
     "referencing": f"{PREFIX}_activity", "referenced": f"{PREFIX}_opportunity",
     "lookup_attr": f"{PREFIX}_opportunityid", "lookup_display": "Opportunity"},
]

LOCALIZE_TABLES = [
    (f"{PREFIX}_customer", "顧客", "顧客"),
    (f"{PREFIX}_opportunity", "商談", "商談"),
    (f"{PREFIX}_activity", "活動履歴", "活動履歴"),
    (f"{PREFIX}_territory", "テリトリー", "テリトリー"),
    (f"{PREFIX}_newsinsight", "ニュースインサイト", "ニュースインサイト"),
    (f"{PREFIX}_incident", "インシデント", "インシデント"),
    (f"{PREFIX}_productionorder", "生産指示", "生産指示"),
    (f"{PREFIX}_inventoryitem", "在庫", "在庫"),
    (f"{PREFIX}_qualityissue", "品質課題", "品質課題"),
]

LOCALIZE_COLUMNS = [
    (f"{PREFIX}_customer", f"{PREFIX}_name", "会社名"),
    (f"{PREFIX}_customer", f"{PREFIX}_industry", "業種"),
    (f"{PREFIX}_customer", f"{PREFIX}_contactperson", "担当者名"),
    (f"{PREFIX}_customer", f"{PREFIX}_email", "メール"),
    (f"{PREFIX}_customer", f"{PREFIX}_phone", "電話番号"),
    (f"{PREFIX}_customer", f"{PREFIX}_address", "住所"),
    (f"{PREFIX}_customer", f"{PREFIX}_notes", "備考"),
    (f"{PREFIX}_opportunity", f"{PREFIX}_name", "商談名"),
    (f"{PREFIX}_opportunity", f"{PREFIX}_stage", "フェーズ"),
    (f"{PREFIX}_opportunity", f"{PREFIX}_amount", "金額"),
    (f"{PREFIX}_opportunity", f"{PREFIX}_probability", "確度"),
    (f"{PREFIX}_opportunity", f"{PREFIX}_expectedclosedate", "予定完了日"),
    (f"{PREFIX}_opportunity", f"{PREFIX}_description", "詳細"),
    (f"{PREFIX}_opportunity", f"{PREFIX}_aiinsights", "AIインサイト"),
    (f"{PREFIX}_opportunity", f"{PREFIX}_customerid", "顧客"),
    (f"{PREFIX}_activity", f"{PREFIX}_name", "件名"),
    (f"{PREFIX}_activity", f"{PREFIX}_type", "種別"),
    (f"{PREFIX}_activity", f"{PREFIX}_activitydate", "活動日"),
    (f"{PREFIX}_activity", f"{PREFIX}_content", "内容"),
    (f"{PREFIX}_activity", f"{PREFIX}_nextaction", "次のアクション"),
    (f"{PREFIX}_activity", f"{PREFIX}_customerid", "顧客"),
    (f"{PREFIX}_activity", f"{PREFIX}_opportunityid", "商談"),
    (f"{PREFIX}_territory", f"{PREFIX}_name", "テリトリー名"),
    (f"{PREFIX}_territory", f"{PREFIX}_budget", "予算"),
    (f"{PREFIX}_territory", f"{PREFIX}_fiscalyear", "会計年度"),
    (f"{PREFIX}_territory", f"{PREFIX}_notes", "備考"),
    (f"{PREFIX}_territory", f"{PREFIX}_customerid", "顧客"),
    (f"{PREFIX}_newsinsight", f"{PREFIX}_headline", "見出し"),
    (f"{PREFIX}_newsinsight", f"{PREFIX}_summary", "要約"),
    (f"{PREFIX}_newsinsight", f"{PREFIX}_action", "アクション"),
    (f"{PREFIX}_newsinsight", f"{PREFIX}_impact", "インパクト"),
    (f"{PREFIX}_newsinsight", f"{PREFIX}_category", "カテゴリ"),
    (f"{PREFIX}_newsinsight", f"{PREFIX}_relatedcustomers", "関連顧客"),
    (f"{PREFIX}_newsinsight", f"{PREFIX}_generateddate", "生成日"),
    (f"{PREFIX}_incident", f"{PREFIX}_title", "タイトル"),
    (f"{PREFIX}_incident", f"{PREFIX}_description", "詳細"),
    (f"{PREFIX}_incident", f"{PREFIX}_status", "ステータス"),
    (f"{PREFIX}_incident", f"{PREFIX}_priority", "優先度"),
    (f"{PREFIX}_incident", f"{PREFIX}_assettype", "資産種別"),
    (f"{PREFIX}_incident", f"{PREFIX}_assetstatus", "資産ステータス"),
    (f"{PREFIX}_incident", f"{PREFIX}_reportedby", "報告者"),
    (f"{PREFIX}_incident", f"{PREFIX}_assignedto", "担当者"),
    (f"{PREFIX}_incident", f"{PREFIX}_resolvedon", "解決日"),
    (f"{PREFIX}_incident", f"{PREFIX}_resolution", "解決内容"),
    (f"{PREFIX}_productionorder", f"{PREFIX}_ordernumber", "指示番号"),
    (f"{PREFIX}_productionorder", f"{PREFIX}_productname", "製品名"),
    (f"{PREFIX}_productionorder", f"{PREFIX}_line", "生産ライン"),
    (f"{PREFIX}_productionorder", f"{PREFIX}_duedate", "納期"),
    (f"{PREFIX}_productionorder", f"{PREFIX}_quantity", "数量"),
    (f"{PREFIX}_productionorder", f"{PREFIX}_progress", "進捗率"),
    (f"{PREFIX}_productionorder", f"{PREFIX}_status", "ステータス"),
    (f"{PREFIX}_productionorder", f"{PREFIX}_customerid", "顧客"),
    (f"{PREFIX}_inventoryitem", f"{PREFIX}_partnumber", "部品番号"),
    (f"{PREFIX}_inventoryitem", f"{PREFIX}_partname", "部品名"),
    (f"{PREFIX}_inventoryitem", f"{PREFIX}_stock", "在庫数"),
    (f"{PREFIX}_inventoryitem", f"{PREFIX}_minstock", "最小在庫数"),
    (f"{PREFIX}_qualityissue", f"{PREFIX}_title", "タイトル"),
    (f"{PREFIX}_qualityissue", f"{PREFIX}_category", "カテゴリ"),
    (f"{PREFIX}_qualityissue", f"{PREFIX}_severity", "重大度"),
    (f"{PREFIX}_qualityissue", f"{PREFIX}_status", "ステータス"),
    (f"{PREFIX}_qualityissue", f"{PREFIX}_description", "詳細説明"),
]

LOCALIZE_OPTIONS = [
    (f"{PREFIX}_customer", f"{PREFIX}_industry", [
        (100000000, "製造"), (100000001, "IT"), (100000002, "商社"),
        (100000003, "小売"), (100000004, "金融"), (100000005, "その他"),
    ]),
    (f"{PREFIX}_opportunity", f"{PREFIX}_stage", [
        (100000000, "リード"), (100000001, "提案"), (100000002, "見積"),
        (100000003, "交渉"), (100000004, "受注"), (100000005, "失注"), (100000006, "キャンセル"),
    ]),
    (f"{PREFIX}_activity", f"{PREFIX}_type", [
        (100000000, "訪問"), (100000001, "電話"), (100000002, "メール"),
        (100000003, "オンライン会議"), (100000004, "その他"),
    ]),
    (f"{PREFIX}_incident", f"{PREFIX}_status", [
        (100000000, "新規"), (100000001, "対応中"), (100000002, "解決済"), (100000003, "クローズ"),
    ]),
    (f"{PREFIX}_incident", f"{PREFIX}_priority", [
        (100000000, "低"), (100000001, "中"), (100000002, "高"), (100000003, "緊急"),
    ]),
    (f"{PREFIX}_incident", f"{PREFIX}_assettype", [
        (100000000, "PC"), (100000001, "サーバー"), (100000002, "プリンター"),
        (100000003, "ネットワーク機器"), (100000004, "モバイルデバイス"),
        (100000005, "ソフトウェア"), (100000006, "その他"),
    ]),
    (f"{PREFIX}_incident", f"{PREFIX}_assetstatus", [
        (100000000, "稼働中"), (100000001, "故障中"), (100000002, "メンテナンス中"), (100000003, "廃棄済"),
    ]),
    (f"{PREFIX}_productionorder", f"{PREFIX}_status", [
        (100000000, "設計中"), (100000001, "部品調達"), (100000002, "組立中"),
        (100000003, "検査待ち"), (100000004, "出荷済み"), (100000005, "完了"),
    ]),
    (f"{PREFIX}_qualityissue", f"{PREFIX}_category", [
        (100000000, "寸法不良"), (100000001, "外観不良"), (100000002, "機能不良"), (100000003, "その他"),
    ]),
    (f"{PREFIX}_qualityissue", f"{PREFIX}_severity", [
        (100000000, "軽微"), (100000001, "中程度"), (100000002, "重大"), (100000003, "致命的"),
    ]),
    (f"{PREFIX}_qualityissue", f"{PREFIX}_status", [
        (100000000, "未着手"), (100000001, "対応中"), (100000002, "完了"),
    ]),
]
```

- [ ] **Step 3: create_demo_data() を空実装のまま確認**

デモデータ投入は本プランのスコープ外（design docの「スコープ外」節に準拠）。`create_demo_data()` はテンプレートのまま（`print("  ℹ テンプレート — プロジェクト固有のデモデータをここに実装")` のみ）で変更しない。

- [ ] **Step 4: 実行**

Run:
```bash
cd scripts && .venv/bin/python setup_dataverse.py 2>&1 | tee setup_dataverse.log && cd ..
```

初回はデバイスコード認証を求められる場合がある（Task 2 Step 4 で認証済みなら不要）。

Expected: ログの最後に `✅ Dataverse セットアップ完了!` が出力される。`=== Step 8: テーブル検証 ===` の全9行が `✅ ... OK (rows=0)` になっていることを確認する。1行でも `❌` があれば、そのテーブルのログを遡ってエラー内容を確認し、該当テーブル定義を修正して再実行する（`retry_metadata` によりテーブル・列は既存の場合スキップされるため、再実行は安全）。

- [ ] **Step 5: コミット**

```bash
git add scripts/setup_dataverse.py
git commit -m "feat: define and provision all Dataverse tables for sales and production management"
```

`scripts/setup_dataverse.log` と `scripts/create_publisher.py` はコミット対象外（一時ファイルのため `rm scripts/setup_dataverse.log scripts/create_publisher.py` で削除してよい）。

---

### Task 4: データソース登録（nameUtils パッチ + add-data-source ×9）

**Files:**
- Create: `patch-nameutils.cjs`
- Modify: `node_modules/@microsoft/power-apps-actions/dist/CodeGen/shared/nameUtils.js`（パッチ適用、gitignore対象なのでコミット不要）
- Create: `.power/schemas/appschemas/dataSourcesInfo.ts`（`add-data-source` が自動生成/更新）
- Create: `src/generated/`（`add-data-source` が自動生成。このプロジェクトでは使わないため参照しない）

**Interfaces:**
- Consumes: Task 1 の `power.config.json`、Task 3 で作成した9テーブルの論理名
- Produces: `.power/schemas/appschemas/dataSourcesInfo.ts` に9テーブル分のスキーマ情報（`tableId`, `primaryKey`, `apis` 等）が登録される。Task 6（`production-service.ts`）が `src/lib/dataSourcesInfo.ts` 経由でこれを利用する。

- [ ] **Step 1: nameUtils.js パッチスクリプトを作成**

Write `patch-nameutils.cjs`:
```javascript
const fs = require("fs");
const p =
  "node_modules/@microsoft/power-apps-actions/dist/CodeGen/shared/nameUtils.js";
let c = fs.readFileSync(p, "utf8");
const oldPat = "[^a-zA-Z0-9_$]/g, '_')";
const newPat =
  "[^a-zA-Z0-9_$\\u00C0-\\u024F\\u0370-\\u03FF\\u0400-\\u04FF\\u3000-\\u9FFF\\uAC00-\\uD7AF\\uF900-\\uFAFF]/g, '_')";
if (c.includes(oldPat)) {
  c = c.replace(oldPat, newPat);
  fs.writeFileSync(p, c);
  console.log("Patched successfully");
} else {
  console.log("Already patched or pattern not found");
}
```

- [ ] **Step 2: パッチを適用して検証**

Run:
```bash
node patch-nameutils.cjs
node -e "const c=require('fs').readFileSync('node_modules/@microsoft/power-apps-actions/dist/CodeGen/shared/nameUtils.js','utf8');c.split('\n').forEach((l,i)=>{if(l.includes('replace')&&l.includes('a-zA-Z'))console.log(i+':',l.trim())})"
```
Expected: 1行目のコマンドは `Patched successfully` を出力する。2行目のコマンドは Unicode 範囲（`　-鿿` 等）を含む正規表現行を表示する。

- [ ] **Step 3: 9テーブル分のデータソースを登録**

Run（1テーブルずつ、失敗した場合はそのテーブル名を控えて次に進み、Step 4 まで完了させてから再実行する）:
```bash
npx power-apps add-data-source --api-id dataverse --resource-name geek_customer --org-url https://org3be00c11.crm7.dynamics.com/ --non-interactive
npx power-apps add-data-source --api-id dataverse --resource-name geek_opportunity --org-url https://org3be00c11.crm7.dynamics.com/ --non-interactive
npx power-apps add-data-source --api-id dataverse --resource-name geek_activity --org-url https://org3be00c11.crm7.dynamics.com/ --non-interactive
npx power-apps add-data-source --api-id dataverse --resource-name geek_territory --org-url https://org3be00c11.crm7.dynamics.com/ --non-interactive
npx power-apps add-data-source --api-id dataverse --resource-name geek_newsinsight --org-url https://org3be00c11.crm7.dynamics.com/ --non-interactive
npx power-apps add-data-source --api-id dataverse --resource-name geek_incident --org-url https://org3be00c11.crm7.dynamics.com/ --non-interactive
npx power-apps add-data-source --api-id dataverse --resource-name geek_productionorder --org-url https://org3be00c11.crm7.dynamics.com/ --non-interactive
npx power-apps add-data-source --api-id dataverse --resource-name geek_inventoryitem --org-url https://org3be00c11.crm7.dynamics.com/ --non-interactive
npx power-apps add-data-source --api-id dataverse --resource-name geek_qualityissue --org-url https://org3be00c11.crm7.dynamics.com/ --non-interactive
```
Expected: 各コマンドが正常終了する。`npm install` を Task 4 の途中で再実行した場合はパッチが消えるため Step 2 をやり直す。

- [ ] **Step 4: 生成物を確認**

Run: `cat .power/schemas/appschemas/dataSourcesInfo.ts | grep -o '"geek_[a-z]*":' | sort -u`
Expected: 9テーブル分のキー（`geek_customer`, `geek_opportunity`, `geek_activity`, `geek_territory`, `geek_newsinsight`, `geek_incident`, `geek_productionorder`, `geek_inventoryitem`, `geek_qualityissue`）が出力される。

- [ ] **Step 5: entity set 名を記録**

Run:
```bash
grep -A2 '"geek_productionorder"' .power/schemas/appschemas/dataSourcesInfo.ts | head -5
grep -A2 '"geek_inventoryitem"' .power/schemas/appschemas/dataSourcesInfo.ts | head -5
grep -A2 '"geek_qualityissue"' .power/schemas/appschemas/dataSourcesInfo.ts | head -5
```
出力される `tableId` を確認する。Task 6 では `client().retrieveMultipleRecordsAsync()` の第一引数にエンティティセット名（複数形。既存コードの慣例では `geek_productionorders` / `geek_inventoryitems` / `geek_qualityissues` になる想定）を使う。想定と異なる場合は Task 6 実装時にこの出力の値を使うよう読み替える。

- [ ] **Step 6: ビルド確認**

Run: `npm run build`
Expected: `src/generated/` 関連のTypeScriptエラーが出ないこと（このプロジェクトでは `src/generated/` のサービスは使わず、Task 6 で手書きの `production-service.ts` を使うため、`src/generated/` 自体のビルドエラーは無視してよいが、`src/lib/dataSourcesInfo.ts` の import でエラーが出ないことを確認する）。

- [ ] **Step 7: コミット**

```bash
git add patch-nameutils.cjs .power
git commit -m "feat: register Dataverse data sources for all 9 tables"
```

`.power` は `.gitignore` に `.power/` のエントリがあるため、通常は追跡されない。`git status` で `.power` が無視されていることを確認し、無視されている場合は `patch-nameutils.cjs` のみコミットする（`.power` はローカル環境ごとに再生成すればよい設計のため、コミットしなくても問題ない）。

---

### Task 5: 生産管理の型定義

**Files:**
- Create: `src/types/production.ts`

**Interfaces:**
- Consumes: なし
- Produces: `ProductionOrder`, `ProductionOrderCreate`, `ProductionOrderRecord`, `ProductionOrderStatus`, `ProductionOrderStatusValues`, `ProductionOrderStatusLabels`, `InventoryItem`, `InventoryItemCreate`, `InventoryItemRecord`, `QualityIssue`, `QualityIssueCreate`, `QualityIssueRecord`, `QualityCategory`/`QualitySeverity`/`QualityStatus` とその `Values`/`Labels` マップ。Task 6（サービス層）と Task 9〜11（ページ）が使用する。

- [ ] **Step 1: ファイルを作成**

Write `src/types/production.ts`:
```typescript
// 生産管理 型定義

// ── 生産指示 (geek_productionorder) ──
export interface ProductionOrderRecord {
  [key: string]: unknown;
  geek_productionorderid: string;
  geek_ordernumber: string;
  geek_productname?: string;
  _geek_customerid_value?: string;
  geek_line?: string;
  geek_duedate?: string;
  geek_quantity?: number;
  geek_progress?: number;
  geek_status?: number;
  createdon?: string;
  modifiedon?: string;
}

export type ProductionOrderStatus =
  | "設計中" | "部品調達" | "組立中" | "検査待ち" | "出荷済み" | "完了";

export const ProductionOrderStatusValues: Record<ProductionOrderStatus, number> = {
  "設計中": 100000000,
  "部品調達": 100000001,
  "組立中": 100000002,
  "検査待ち": 100000003,
  "出荷済み": 100000004,
  "完了": 100000005,
};

export const ProductionOrderStatusLabels: Record<number, ProductionOrderStatus> = {
  100000000: "設計中",
  100000001: "部品調達",
  100000002: "組立中",
  100000003: "検査待ち",
  100000004: "出荷済み",
  100000005: "完了",
};

export interface ProductionOrder {
  id: string;
  orderNumber: string;
  productName: string;
  customerId: string;
  customer: string;
  line: string;
  dueDate: string;
  quantity: number;
  progress: number;
  status: ProductionOrderStatus;
}

export interface ProductionOrderCreate {
  orderNumber: string;
  productName: string;
  customerId: string;
  line: string;
  dueDate: string;
  quantity: number;
  progress: number;
  status: ProductionOrderStatus;
}

// ── 在庫 (geek_inventoryitem) ──
export interface InventoryItemRecord {
  [key: string]: unknown;
  geek_inventoryitemid: string;
  geek_partnumber: string;
  geek_partname?: string;
  geek_stock?: number;
  geek_minstock?: number;
  createdon?: string;
  modifiedon?: string;
}

export interface InventoryItem {
  id: string;
  partNumber: string;
  partName: string;
  stock: number;
  minStock: number;
}

export type InventoryItemCreate = Omit<InventoryItem, "id">;

// ── 品質課題 (geek_qualityissue) ──
export interface QualityIssueRecord {
  [key: string]: unknown;
  geek_qualityissueid: string;
  geek_title: string;
  geek_category?: number;
  geek_severity?: number;
  geek_status?: number;
  geek_description?: string;
  createdon?: string;
  modifiedon?: string;
}

export type QualityCategory = "寸法不良" | "外観不良" | "機能不良" | "その他";
export type QualitySeverity = "軽微" | "中程度" | "重大" | "致命的";
export type QualityStatus = "未着手" | "対応中" | "完了";

export const QualityCategoryValues: Record<QualityCategory, number> = {
  "寸法不良": 100000000, "外観不良": 100000001, "機能不良": 100000002, "その他": 100000003,
};
export const QualityCategoryLabels: Record<number, QualityCategory> = {
  100000000: "寸法不良", 100000001: "外観不良", 100000002: "機能不良", 100000003: "その他",
};

export const QualitySeverityValues: Record<QualitySeverity, number> = {
  "軽微": 100000000, "中程度": 100000001, "重大": 100000002, "致命的": 100000003,
};
export const QualitySeverityLabels: Record<number, QualitySeverity> = {
  100000000: "軽微", 100000001: "中程度", 100000002: "重大", 100000003: "致命的",
};

export const QualityStatusValues: Record<QualityStatus, number> = {
  "未着手": 100000000, "対応中": 100000001, "完了": 100000002,
};
export const QualityStatusLabels: Record<number, QualityStatus> = {
  100000000: "未着手", 100000001: "対応中", 100000002: "完了",
};

export interface QualityIssue {
  id: string;
  title: string;
  category: QualityCategory;
  severity: QualitySeverity;
  status: QualityStatus;
  description: string;
}

export type QualityIssueCreate = Omit<QualityIssue, "id">;
```

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit src/types/production.ts 2>&1 | head -30`
Expected: このファイル単体では `@/` パスエイリアス由来のエラーは出ない（他ファイルへの依存がないため）。構文エラーが出ないことを確認する。

- [ ] **Step 3: コミット**

```bash
git add src/types/production.ts
git commit -m "feat: add production management type definitions"
```

---

### Task 6: 生産管理サービス層

**Files:**
- Create: `src/services/production-service.ts`

**Interfaces:**
- Consumes: `src/types/production.ts` の全エクスポート（Task 5）、`src/types/dataverse.ts` の `Customer` 型、`src/lib/dataSourcesInfo.ts` の `dataSourcesInfo`
- Produces: `getProductionOrders`, `createProductionOrder`, `updateProductionOrder`, `deleteProductionOrder`, `getInventoryItems`, `createInventoryItem`, `updateInventoryItem`, `deleteInventoryItem`, `getQualityIssues`, `createQualityIssue`, `updateQualityIssue`, `deleteQualityIssue`。`src/pages/dashboard.tsx`（Task 8 で `production-dashboard.tsx` に移動）が既に `getInventoryItems`/`getProductionOrders`/`getQualityIssues` をimportしている。Task 7（フック）が全関数を使用する。

`geek_productionorder.geek_status` 等は Dataverse 上は Picklist（数値）だが、`production-dashboard.tsx` の既存コードは `order.status` を日本語文字列として直接比較・表示する。そのため本サービス層で数値→日本語ラベルの変換を行い、`ProductionOrder`/`QualityIssue` の domain 型として返す。

- [ ] **Step 1: ファイルを作成**

Write `src/services/production-service.ts`:
```typescript
import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "@/lib/dataSourcesInfo";
import type { Customer } from "@/types/dataverse";
import {
  ProductionOrderStatusValues,
  ProductionOrderStatusLabels,
  QualityCategoryValues,
  QualityCategoryLabels,
  QualitySeverityValues,
  QualitySeverityLabels,
  QualityStatusValues,
  QualityStatusLabels,
} from "@/types/production";
import type {
  ProductionOrder,
  ProductionOrderCreate,
  ProductionOrderRecord,
  InventoryItem,
  InventoryItemCreate,
  InventoryItemRecord,
  QualityIssue,
  QualityIssueCreate,
  QualityIssueRecord,
} from "@/types/production";

function client() {
  return getClient(dataSourcesInfo);
}

async function getCustomerNameMap(): Promise<Map<string, string>> {
  const result = await client().retrieveMultipleRecordsAsync<Customer>("geek_customers", {
    select: ["geek_customerid", "geek_name"],
  });
  if (!result.success) throw result.error;
  const map = new Map<string, string>();
  (result.data ?? []).forEach((c) => map.set(c.geek_customerid, c.geek_name));
  return map;
}

// ── 生産指示 ──
export async function getProductionOrders(): Promise<ProductionOrder[]> {
  const [ordersResult, customerMap] = await Promise.all([
    client().retrieveMultipleRecordsAsync<ProductionOrderRecord>("geek_productionorders", {
      select: [
        "geek_productionorderid", "geek_ordernumber", "geek_productname",
        "_geek_customerid_value", "geek_line", "geek_duedate",
        "geek_quantity", "geek_progress", "geek_status",
      ],
      orderBy: ["geek_duedate asc"],
    }),
    getCustomerNameMap(),
  ]);
  if (!ordersResult.success) throw ordersResult.error;
  return (ordersResult.data ?? []).map((r) => ({
    id: r.geek_productionorderid,
    orderNumber: r.geek_ordernumber,
    productName: r.geek_productname ?? "",
    customerId: r._geek_customerid_value ?? "",
    customer: r._geek_customerid_value ? customerMap.get(r._geek_customerid_value) ?? "" : "",
    line: r.geek_line ?? "",
    dueDate: r.geek_duedate ?? "",
    quantity: r.geek_quantity ?? 0,
    progress: r.geek_progress ?? 0,
    status: ProductionOrderStatusLabels[r.geek_status ?? 100000000] ?? "設計中",
  }));
}

export async function createProductionOrder(data: ProductionOrderCreate) {
  const body: Record<string, unknown> = {
    geek_ordernumber: data.orderNumber,
    geek_productname: data.productName,
    geek_line: data.line,
    geek_duedate: data.dueDate,
    geek_quantity: data.quantity,
    geek_progress: data.progress,
    geek_status: ProductionOrderStatusValues[data.status],
  };
  if (data.customerId) {
    body["geek_customerid@odata.bind"] = `/geek_customers(${data.customerId})`;
  }
  const result = await client().createRecordAsync<typeof body, ProductionOrderRecord>(
    "geek_productionorders",
    body,
  );
  if (!result.success) throw result.error;
  return result.data;
}

export async function updateProductionOrder(id: string, data: Partial<ProductionOrderCreate>) {
  const body: Record<string, unknown> = {};
  if (data.orderNumber !== undefined) body.geek_ordernumber = data.orderNumber;
  if (data.productName !== undefined) body.geek_productname = data.productName;
  if (data.line !== undefined) body.geek_line = data.line;
  if (data.dueDate !== undefined) body.geek_duedate = data.dueDate;
  if (data.quantity !== undefined) body.geek_quantity = data.quantity;
  if (data.progress !== undefined) body.geek_progress = data.progress;
  if (data.status !== undefined) body.geek_status = ProductionOrderStatusValues[data.status];
  if (data.customerId !== undefined) {
    body["geek_customerid@odata.bind"] = `/geek_customers(${data.customerId})`;
  }
  const result = await client().updateRecordAsync<typeof body, ProductionOrderRecord>(
    "geek_productionorders",
    id,
    body,
  );
  if (!result.success) throw result.error;
  return result.data;
}

export async function deleteProductionOrder(id: string) {
  const result = await client().deleteRecordAsync("geek_productionorders", id);
  if (!result.success) throw result.error;
}

// ── 在庫 ──
export async function getInventoryItems(): Promise<InventoryItem[]> {
  const result = await client().retrieveMultipleRecordsAsync<InventoryItemRecord>("geek_inventoryitems", {
    select: ["geek_inventoryitemid", "geek_partnumber", "geek_partname", "geek_stock", "geek_minstock"],
    orderBy: ["geek_partnumber asc"],
  });
  if (!result.success) throw result.error;
  return (result.data ?? []).map((r) => ({
    id: r.geek_inventoryitemid,
    partNumber: r.geek_partnumber,
    partName: r.geek_partname ?? "",
    stock: r.geek_stock ?? 0,
    minStock: r.geek_minstock ?? 0,
  }));
}

export async function createInventoryItem(data: InventoryItemCreate) {
  const body = {
    geek_partnumber: data.partNumber,
    geek_partname: data.partName,
    geek_stock: data.stock,
    geek_minstock: data.minStock,
  };
  const result = await client().createRecordAsync<typeof body, InventoryItemRecord>(
    "geek_inventoryitems",
    body,
  );
  if (!result.success) throw result.error;
  return result.data;
}

export async function updateInventoryItem(id: string, data: Partial<InventoryItemCreate>) {
  const body: Record<string, unknown> = {};
  if (data.partNumber !== undefined) body.geek_partnumber = data.partNumber;
  if (data.partName !== undefined) body.geek_partname = data.partName;
  if (data.stock !== undefined) body.geek_stock = data.stock;
  if (data.minStock !== undefined) body.geek_minstock = data.minStock;
  const result = await client().updateRecordAsync<typeof body, InventoryItemRecord>(
    "geek_inventoryitems",
    id,
    body,
  );
  if (!result.success) throw result.error;
  return result.data;
}

export async function deleteInventoryItem(id: string) {
  const result = await client().deleteRecordAsync("geek_inventoryitems", id);
  if (!result.success) throw result.error;
}

// ── 品質課題 ──
export async function getQualityIssues(): Promise<QualityIssue[]> {
  const result = await client().retrieveMultipleRecordsAsync<QualityIssueRecord>("geek_qualityissues", {
    select: ["geek_qualityissueid", "geek_title", "geek_category", "geek_severity", "geek_status", "geek_description"],
    orderBy: ["createdon desc"],
  });
  if (!result.success) throw result.error;
  return (result.data ?? []).map((r) => ({
    id: r.geek_qualityissueid,
    title: r.geek_title,
    category: QualityCategoryLabels[r.geek_category ?? 100000003] ?? "その他",
    severity: QualitySeverityLabels[r.geek_severity ?? 100000000] ?? "軽微",
    status: QualityStatusLabels[r.geek_status ?? 100000000] ?? "未着手",
    description: r.geek_description ?? "",
  }));
}

export async function createQualityIssue(data: QualityIssueCreate) {
  const body = {
    geek_title: data.title,
    geek_category: QualityCategoryValues[data.category],
    geek_severity: QualitySeverityValues[data.severity],
    geek_status: QualityStatusValues[data.status],
    geek_description: data.description,
  };
  const result = await client().createRecordAsync<typeof body, QualityIssueRecord>(
    "geek_qualityissues",
    body,
  );
  if (!result.success) throw result.error;
  return result.data;
}

export async function updateQualityIssue(id: string, data: Partial<QualityIssueCreate>) {
  const body: Record<string, unknown> = {};
  if (data.title !== undefined) body.geek_title = data.title;
  if (data.category !== undefined) body.geek_category = QualityCategoryValues[data.category];
  if (data.severity !== undefined) body.geek_severity = QualitySeverityValues[data.severity];
  if (data.status !== undefined) body.geek_status = QualityStatusValues[data.status];
  if (data.description !== undefined) body.geek_description = data.description;
  const result = await client().updateRecordAsync<typeof body, QualityIssueRecord>(
    "geek_qualityissues",
    id,
    body,
  );
  if (!result.success) throw result.error;
  return result.data;
}

export async function deleteQualityIssue(id: string) {
  const result = await client().deleteRecordAsync("geek_qualityissues", id);
  if (!result.success) throw result.error;
}
```

**注記:** `select` に含めた `"_geek_customerid_value"` のエンティティセット名 `geek_productionorders`/`geek_inventoryitems`/`geek_qualityissues` は Task 4 Step 5 で確認した実際の値に読み替えること（Dataverse の標準複数形化ルールでは一致する見込みだが、異なっていた場合はこのファイルの文字列リテラルをすべて修正する）。

- [ ] **Step 2: コミット**

```bash
git add src/services/production-service.ts
git commit -m "feat: add production management service layer"
```

---

### Task 7: 生産管理フック

**Files:**
- Create: `src/hooks/use-production.ts`

**Interfaces:**
- Consumes: `src/services/production-service.ts` の全エクスポート（Task 6）
- Produces: `useProductionOrders`, `useCreateProductionOrder`, `useUpdateProductionOrder`, `useDeleteProductionOrder`, `useInventoryItems`, `useCreateInventoryItem`, `useUpdateInventoryItem`, `useDeleteInventoryItem`, `useQualityIssues`, `useCreateQualityIssue`, `useUpdateQualityIssue`, `useDeleteQualityIssue`。Task 8〜11 のページが使用する。

- [ ] **Step 1: ファイルを作成**

Write `src/hooks/use-production.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getProductionOrders, createProductionOrder, updateProductionOrder, deleteProductionOrder,
  getInventoryItems, createInventoryItem, updateInventoryItem, deleteInventoryItem,
  getQualityIssues, createQualityIssue, updateQualityIssue, deleteQualityIssue,
} from "@/services/production-service";
import type { ProductionOrderCreate, InventoryItemCreate, QualityIssueCreate } from "@/types/production";

// ── 生産指示 hooks ──
export function useProductionOrders() {
  return useQuery({ queryKey: ["productionOrders"], queryFn: getProductionOrders });
}
export function useCreateProductionOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProductionOrderCreate) => createProductionOrder(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["productionOrders"] }),
  });
}
export function useUpdateProductionOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProductionOrderCreate> }) =>
      updateProductionOrder(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["productionOrders"] }),
  });
}
export function useDeleteProductionOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProductionOrder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["productionOrders"] }),
  });
}

// ── 在庫 hooks ──
export function useInventoryItems() {
  return useQuery({ queryKey: ["inventoryItems"], queryFn: getInventoryItems });
}
export function useCreateInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: InventoryItemCreate) => createInventoryItem(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventoryItems"] }),
  });
}
export function useUpdateInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InventoryItemCreate> }) =>
      updateInventoryItem(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventoryItems"] }),
  });
}
export function useDeleteInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteInventoryItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventoryItems"] }),
  });
}

// ── 品質課題 hooks ──
export function useQualityIssues() {
  return useQuery({ queryKey: ["qualityIssues"], queryFn: getQualityIssues });
}
export function useCreateQualityIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: QualityIssueCreate) => createQualityIssue(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["qualityIssues"] }),
  });
}
export function useUpdateQualityIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<QualityIssueCreate> }) =>
      updateQualityIssue(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["qualityIssues"] }),
  });
}
export function useDeleteQualityIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteQualityIssue(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["qualityIssues"] }),
  });
}
```

- [ ] **Step 2: コミット**

```bash
git add src/hooks/use-production.ts
git commit -m "feat: add production management React Query hooks"
```

---

### Task 8: production-dashboard.tsx への移動

**Files:**
- Modify (move): `src/pages/dashboard.tsx` → `src/pages/production-dashboard.tsx`

**Interfaces:**
- Consumes: `src/services/production-service.ts`（既にimport済み、Task 6）
- Produces: `src/router.tsx`（既存の未コミット差分で `@/pages/production-dashboard` を参照済み）が解決する。

`src/pages/dashboard.tsx` の内容は既に生産管理ダッシュボードとして書き換え済みで、`getInventoryItems`/`getProductionOrders`/`getQualityIssues` をimportしている。ファイルを移動するだけでよく、中身の変更は不要。

- [ ] **Step 1: ファイルを移動**

Run: `git mv src/pages/dashboard.tsx src/pages/production-dashboard.tsx`
Expected: `src/pages/dashboard.tsx` が無くなり、`src/pages/production-dashboard.tsx` が作成される。

- [ ] **Step 2: 他に dashboard.tsx を参照するファイルが無いことを確認**

Run: `grep -rn '"@/pages/dashboard"' src/ || echo "no references"`
Expected: `no references`（`src/router.tsx` は既に `production-dashboard` を参照する差分になっている）。

- [ ] **Step 3: コミット**

```bash
git add -A
git commit -m "refactor: move dashboard.tsx to production-dashboard.tsx"
```

---

### Task 9: work-orders.tsx（生産指示 CRUD ページ）

**Files:**
- Create: `src/pages/work-orders.tsx`

**Interfaces:**
- Consumes: `useProductionOrders`/`useCreateProductionOrder`/`useUpdateProductionOrder`/`useDeleteProductionOrder`（Task 7）, `useCustomers`（既存 `src/hooks/use-dataverse.ts`）, `ProductionOrderStatusValues`/`ProductionOrder`/`ProductionOrderCreate`/`ProductionOrderStatus`（Task 5）
- Produces: `src/router.tsx` の `production-orders` ルート（既存の未コミット差分で `@/pages/work-orders` を参照済み）が解決する。

- [ ] **Step 1: ファイルを作成**

Write `src/pages/work-orders.tsx`:
```tsx
import { useMemo, useState, useRef } from "react";
import { ListTable, type TableColumn, type FilterConfig } from "@/components/list-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useProductionOrders, useCreateProductionOrder, useUpdateProductionOrder, useDeleteProductionOrder,
} from "@/hooks/use-production";
import { useCustomers } from "@/hooks/use-dataverse";
import {
  ProductionOrderStatusValues, type ProductionOrder, type ProductionOrderCreate, type ProductionOrderStatus,
} from "@/types/production";
import { LoadingSkeletonCard } from "@/components/loading-skeleton";
import { FormModal } from "@/components/form-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Plus, Trash2 } from "lucide-react";

const STATUS_OPTIONS = Object.keys(ProductionOrderStatusValues) as ProductionOrderStatus[];

export default function WorkOrdersPage() {
  const { data: orders = [], isLoading } = useProductionOrders();
  const { data: customers = [] } = useCustomers();
  const createMutation = useCreateProductionOrder();
  const updateMutation = useUpdateProductionOrder();
  const deleteMutation = useDeleteProductionOrder();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<ProductionOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductionOrder | null>(null);
  const submitRef = useRef<(() => void) | null>(null);

  const columns: TableColumn<ProductionOrder>[] = useMemo(() => [
    { key: "orderNumber", label: "指示番号", sortable: true },
    { key: "productName", label: "製品名", sortable: true },
    { key: "customer", label: "顧客" },
    {
      key: "dueDate", label: "納期", sortable: true,
      render: (item) => (item.dueDate ? new Date(item.dueDate).toLocaleDateString("ja-JP") : ""),
    },
    {
      key: "progress", label: "進捗", align: "center",
      render: (item) => `${item.progress}%`,
    },
    {
      key: "status", label: "ステータス",
      render: (item) => <Badge variant="secondary" className="text-xs">{item.status}</Badge>,
    },
  ], []);

  const filters: FilterConfig<ProductionOrder>[] = useMemo(() => [
    {
      key: "status" as keyof ProductionOrder,
      label: "ステータス",
      placeholder: "ステータスで絞込",
      options: STATUS_OPTIONS.map((s) => ({ value: s, label: s })),
    },
  ], []);

  const handleSave = (formData: Partial<ProductionOrderCreate>) => {
    if (editItem) {
      updateMutation.mutate(
        { id: editItem.id, data: formData },
        { onSuccess: () => { setIsFormOpen(false); setEditItem(null); } },
      );
    } else {
      createMutation.mutate(formData as ProductionOrderCreate, {
        onSuccess: () => { setIsFormOpen(false); },
      });
    }
  };

  if (isLoading) return <div className="p-4 md:p-6"><LoadingSkeletonCard variant="detailed" count={3} /></div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">生産指示</h2>
        <Button onClick={() => { setEditItem(null); setIsFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />新規作成
        </Button>
      </div>

      <ListTable<ProductionOrder>
        data={orders}
        columns={columns}
        searchKeys={["orderNumber", "productName", "customer"]}
        searchPlaceholder="指示番号・製品名・顧客で検索..."
        filters={filters}
        onRowClick={(item) => { setEditItem(item); setIsFormOpen(true); }}
        emptyMessage="生産指示がありません"
      />

      <FormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editItem ? "生産指示編集" : "新規生産指示"}
        onSave={() => submitRef.current?.()}
        isSaving={createMutation.isPending || updateMutation.isPending}
      >
        <WorkOrderForm
          item={editItem}
          customers={customers}
          onSubmit={handleSave}
          onDelete={editItem ? () => setDeleteTarget(editItem) : undefined}
          submitRef={submitRef}
        />
      </FormModal>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="生産指示を削除"
        description={`「${deleteTarget?.orderNumber}」を削除しますか？この操作は取り消せません。`}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id, {
              onSuccess: () => { setDeleteTarget(null); setIsFormOpen(false); setEditItem(null); },
            });
          }
        }}
        confirmLabel="削除"
        variant="destructive"
      />
    </div>
  );
}

function WorkOrderForm({
  item, customers, onSubmit, onDelete, submitRef,
}: {
  item: ProductionOrder | null;
  customers: { geek_customerid: string; geek_name: string }[];
  onSubmit: (data: Partial<ProductionOrderCreate>) => void;
  onDelete?: () => void;
  submitRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const [orderNumber, setOrderNumber] = useState(item?.orderNumber ?? "");
  const [productName, setProductName] = useState(item?.productName ?? "");
  const [customerId, setCustomerId] = useState(item?.customerId ?? "");
  const [line, setLine] = useState(item?.line ?? "");
  const [dueDate, setDueDate] = useState(item?.dueDate?.split("T")[0] ?? "");
  const [quantity, setQuantity] = useState(item?.quantity?.toString() ?? "");
  const [progress, setProgress] = useState(item?.progress?.toString() ?? "0");
  const [status, setStatus] = useState<ProductionOrderStatus>(item?.status ?? "設計中");

  const doSubmit = () => {
    if (!orderNumber.trim()) return;
    const data: Partial<ProductionOrderCreate> = {
      orderNumber,
      productName,
      customerId,
      line,
      dueDate,
      quantity: Number(quantity) || 0,
      progress: Number(progress) || 0,
      status,
    };
    onSubmit(data);
  };
  if (submitRef) submitRef.current = doSubmit;

  return (
    <div className="space-y-4">
      <div>
        <Label>指示番号 *</Label>
        <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} required />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>製品名</Label>
          <Input value={productName} onChange={(e) => setProductName(e.target.value)} />
        </div>
        <div>
          <Label>顧客</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.geek_customerid} value={c.geek_customerid}>{c.geek_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>生産ライン</Label>
          <Input value={line} onChange={(e) => setLine(e.target.value)} />
        </div>
        <div>
          <Label>納期</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <Label>数量</Label>
          <Input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>進捗(%)</Label>
          <Input type="number" min="0" max="100" value={progress} onChange={(e) => setProgress(e.target.value)} />
        </div>
        <div>
          <Label>ステータス</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ProductionOrderStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(ProductionOrderStatusValues) as ProductionOrderStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {onDelete && (
        <div className="pt-2 border-t">
          <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-1" />削除
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add src/pages/work-orders.tsx
git commit -m "feat: add work orders CRUD page"
```

---

### Task 10: inventory.tsx（在庫 CRUD ページ）

**Files:**
- Create: `src/pages/inventory.tsx`

**Interfaces:**
- Consumes: `useInventoryItems`/`useCreateInventoryItem`/`useUpdateInventoryItem`/`useDeleteInventoryItem`（Task 7）, `InventoryItem`/`InventoryItemCreate`（Task 5）
- Produces: `src/router.tsx` の `inventory` ルート（既存の未コミット差分で `@/pages/inventory` を参照済み）が解決する。

- [ ] **Step 1: ファイルを作成**

Write `src/pages/inventory.tsx`:
```tsx
import { useMemo, useState, useRef } from "react";
import { ListTable, type TableColumn } from "@/components/list-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useInventoryItems, useCreateInventoryItem, useUpdateInventoryItem, useDeleteInventoryItem,
} from "@/hooks/use-production";
import type { InventoryItem, InventoryItemCreate } from "@/types/production";
import { LoadingSkeletonCard } from "@/components/loading-skeleton";
import { FormModal } from "@/components/form-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Plus, Trash2 } from "lucide-react";

export default function InventoryPage() {
  const { data: items = [], isLoading } = useInventoryItems();
  const createMutation = useCreateInventoryItem();
  const updateMutation = useUpdateInventoryItem();
  const deleteMutation = useDeleteInventoryItem();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const submitRef = useRef<(() => void) | null>(null);

  const columns: TableColumn<InventoryItem>[] = useMemo(() => [
    { key: "partNumber", label: "部品番号", sortable: true },
    { key: "partName", label: "部品名", sortable: true },
    { key: "stock", label: "在庫数", align: "right", sortable: true },
    {
      key: "minStock", label: "最小在庫", align: "right",
      render: (item) => (
        <span className="flex items-center justify-end gap-2">
          {item.minStock}
          {item.stock <= item.minStock && (
            <Badge variant="destructive" className="text-xs">要補充</Badge>
          )}
        </span>
      ),
    },
  ], []);

  const handleSave = (formData: Partial<InventoryItemCreate>) => {
    if (editItem) {
      updateMutation.mutate(
        { id: editItem.id, data: formData },
        { onSuccess: () => { setIsFormOpen(false); setEditItem(null); } },
      );
    } else {
      createMutation.mutate(formData as InventoryItemCreate, {
        onSuccess: () => { setIsFormOpen(false); },
      });
    }
  };

  if (isLoading) return <div className="p-4 md:p-6"><LoadingSkeletonCard variant="detailed" count={3} /></div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">在庫</h2>
        <Button onClick={() => { setEditItem(null); setIsFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />新規作成
        </Button>
      </div>

      <ListTable<InventoryItem>
        data={items}
        columns={columns}
        searchKeys={["partNumber", "partName"]}
        searchPlaceholder="部品番号・部品名で検索..."
        onRowClick={(item) => { setEditItem(item); setIsFormOpen(true); }}
        emptyMessage="在庫データがありません"
      />

      <FormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editItem ? "在庫編集" : "新規在庫"}
        onSave={() => submitRef.current?.()}
        isSaving={createMutation.isPending || updateMutation.isPending}
      >
        <InventoryForm
          item={editItem}
          onSubmit={handleSave}
          onDelete={editItem ? () => setDeleteTarget(editItem) : undefined}
          submitRef={submitRef}
        />
      </FormModal>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="在庫を削除"
        description={`「${deleteTarget?.partNumber}」を削除しますか？この操作は取り消せません。`}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id, {
              onSuccess: () => { setDeleteTarget(null); setIsFormOpen(false); setEditItem(null); },
            });
          }
        }}
        confirmLabel="削除"
        variant="destructive"
      />
    </div>
  );
}

function InventoryForm({
  item, onSubmit, onDelete, submitRef,
}: {
  item: InventoryItem | null;
  onSubmit: (data: Partial<InventoryItemCreate>) => void;
  onDelete?: () => void;
  submitRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const [partNumber, setPartNumber] = useState(item?.partNumber ?? "");
  const [partName, setPartName] = useState(item?.partName ?? "");
  const [stock, setStock] = useState(item?.stock?.toString() ?? "0");
  const [minStock, setMinStock] = useState(item?.minStock?.toString() ?? "0");

  const doSubmit = () => {
    if (!partNumber.trim()) return;
    const data: Partial<InventoryItemCreate> = {
      partNumber,
      partName,
      stock: Number(stock) || 0,
      minStock: Number(minStock) || 0,
    };
    onSubmit(data);
  };
  if (submitRef) submitRef.current = doSubmit;

  return (
    <div className="space-y-4">
      <div>
        <Label>部品番号 *</Label>
        <Input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} required />
      </div>
      <div>
        <Label>部品名</Label>
        <Input value={partName} onChange={(e) => setPartName(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>在庫数</Label>
          <Input type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} />
        </div>
        <div>
          <Label>最小在庫数</Label>
          <Input type="number" min="0" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
        </div>
      </div>
      {onDelete && (
        <div className="pt-2 border-t">
          <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-1" />削除
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add src/pages/inventory.tsx
git commit -m "feat: add inventory CRUD page"
```

---

### Task 11: quality.tsx（品質課題 CRUD ページ）

**Files:**
- Create: `src/pages/quality.tsx`

**Interfaces:**
- Consumes: `useQualityIssues`/`useCreateQualityIssue`/`useUpdateQualityIssue`/`useDeleteQualityIssue`（Task 7）, `QualityIssue`/`QualityIssueCreate`/`QualityCategory`/`QualitySeverity`/`QualityStatus`/`QualityCategoryValues`/`QualitySeverityValues`/`QualityStatusValues`（Task 5）
- Produces: `src/router.tsx` の `quality` ルート（既存の未コミット差分で `@/pages/quality` を参照済み）が解決する。

- [ ] **Step 1: ファイルを作成**

Write `src/pages/quality.tsx`:
```tsx
import { useMemo, useState, useRef } from "react";
import { ListTable, type TableColumn, type FilterConfig } from "@/components/list-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useQualityIssues, useCreateQualityIssue, useUpdateQualityIssue, useDeleteQualityIssue,
} from "@/hooks/use-production";
import {
  QualityCategoryValues, QualitySeverityValues, QualityStatusValues,
  type QualityIssue, type QualityIssueCreate,
  type QualityCategory, type QualitySeverity, type QualityStatus,
} from "@/types/production";
import { LoadingSkeletonCard } from "@/components/loading-skeleton";
import { FormModal } from "@/components/form-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Plus, Trash2 } from "lucide-react";

const SEVERITY_COLORS: Record<QualitySeverity, string> = {
  "軽微": "bg-slate-100 text-slate-800",
  "中程度": "bg-amber-100 text-amber-800",
  "重大": "bg-orange-100 text-orange-800",
  "致命的": "bg-red-100 text-red-800",
};

export default function QualityPage() {
  const { data: issues = [], isLoading } = useQualityIssues();
  const createMutation = useCreateQualityIssue();
  const updateMutation = useUpdateQualityIssue();
  const deleteMutation = useDeleteQualityIssue();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<QualityIssue | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QualityIssue | null>(null);
  const submitRef = useRef<(() => void) | null>(null);

  const columns: TableColumn<QualityIssue>[] = useMemo(() => [
    { key: "title", label: "タイトル", sortable: true },
    { key: "category", label: "カテゴリ" },
    {
      key: "severity", label: "重大度",
      render: (item) => (
        <Badge className={`text-xs ${SEVERITY_COLORS[item.severity]}`}>{item.severity}</Badge>
      ),
    },
    {
      key: "status", label: "ステータス",
      render: (item) => <Badge variant="secondary" className="text-xs">{item.status}</Badge>,
    },
  ], []);

  const filters: FilterConfig<QualityIssue>[] = useMemo(() => [
    {
      key: "status" as keyof QualityIssue,
      label: "ステータス",
      placeholder: "ステータスで絞込",
      options: (Object.keys(QualityStatusValues) as QualityStatus[]).map((s) => ({ value: s, label: s })),
    },
  ], []);

  const handleSave = (formData: Partial<QualityIssueCreate>) => {
    if (editItem) {
      updateMutation.mutate(
        { id: editItem.id, data: formData },
        { onSuccess: () => { setIsFormOpen(false); setEditItem(null); } },
      );
    } else {
      createMutation.mutate(formData as QualityIssueCreate, {
        onSuccess: () => { setIsFormOpen(false); },
      });
    }
  };

  if (isLoading) return <div className="p-4 md:p-6"><LoadingSkeletonCard variant="detailed" count={3} /></div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">品質課題</h2>
        <Button onClick={() => { setEditItem(null); setIsFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />新規作成
        </Button>
      </div>

      <ListTable<QualityIssue>
        data={issues}
        columns={columns}
        searchKeys={["title"]}
        searchPlaceholder="タイトルで検索..."
        filters={filters}
        onRowClick={(item) => { setEditItem(item); setIsFormOpen(true); }}
        emptyMessage="品質課題がありません"
      />

      <FormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editItem ? "品質課題編集" : "新規品質課題"}
        onSave={() => submitRef.current?.()}
        isSaving={createMutation.isPending || updateMutation.isPending}
      >
        <QualityIssueForm
          item={editItem}
          onSubmit={handleSave}
          onDelete={editItem ? () => setDeleteTarget(editItem) : undefined}
          submitRef={submitRef}
        />
      </FormModal>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="品質課題を削除"
        description={`「${deleteTarget?.title}」を削除しますか？この操作は取り消せません。`}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id, {
              onSuccess: () => { setDeleteTarget(null); setIsFormOpen(false); setEditItem(null); },
            });
          }
        }}
        confirmLabel="削除"
        variant="destructive"
      />
    </div>
  );
}

function QualityIssueForm({
  item, onSubmit, onDelete, submitRef,
}: {
  item: QualityIssue | null;
  onSubmit: (data: Partial<QualityIssueCreate>) => void;
  onDelete?: () => void;
  submitRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [category, setCategory] = useState<QualityCategory>(item?.category ?? "その他");
  const [severity, setSeverity] = useState<QualitySeverity>(item?.severity ?? "軽微");
  const [status, setStatus] = useState<QualityStatus>(item?.status ?? "未着手");
  const [description, setDescription] = useState(item?.description ?? "");

  const doSubmit = () => {
    if (!title.trim()) return;
    const data: Partial<QualityIssueCreate> = { title, category, severity, status, description };
    onSubmit(data);
  };
  if (submitRef) submitRef.current = doSubmit;

  return (
    <div className="space-y-4">
      <div>
        <Label>タイトル *</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>カテゴリ</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as QualityCategory)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(QualityCategoryValues) as QualityCategory[]).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>重大度</Label>
          <Select value={severity} onValueChange={(v) => setSeverity(v as QualitySeverity)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(QualitySeverityValues) as QualitySeverity[]).map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>ステータス</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as QualityStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(QualityStatusValues) as QualityStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>詳細説明</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
      </div>
      {onDelete && (
        <div className="pt-2 border-t">
          <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-1" />削除
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add src/pages/quality.tsx
git commit -m "feat: add quality issue CRUD page"
```

---

### Task 12: サイドバーナビゲーション更新

**Files:**
- Modify: `src/components/sidebar.tsx`

**Interfaces:**
- Consumes: なし
- Produces: `/production-orders`, `/inventory`, `/quality` へのナビゲーションリンク

- [ ] **Step 1: アイコンimportを追加**

`src/components/sidebar.tsx:4-13` の import 文を変更する。

Old:
```typescript
import {
  LayoutDashboard,
  Building2,
  Handshake,
  Columns3,
  ClipboardList,
  Target,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
```

New:
```typescript
import {
  LayoutDashboard,
  Building2,
  Handshake,
  Columns3,
  ClipboardList,
  Target,
  AlertTriangle,
  Factory,
  Boxes,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
```

- [ ] **Step 2: 「生産管理」カテゴリを追加**

`src/components/sidebar.tsx` の `navItems` 配列（42-68行目）を変更する。

Old:
```typescript
  const navItems: { category: string; items: NavItem[] }[] = [
    {
      category: "概況",
      items: [
        { icon: LayoutDashboard, label: "ダッシュボード", path: "dashboard" },
        { icon: Target, label: "テリトリー", path: "territory" },
      ],
    },
    {
      category: "顧客・商談",
```

New:
```typescript
  const navItems: { category: string; items: NavItem[] }[] = [
    {
      category: "概況",
      items: [
        { icon: LayoutDashboard, label: "ダッシュボード", path: "dashboard" },
        { icon: Target, label: "テリトリー", path: "territory" },
      ],
    },
    {
      category: "生産管理",
      items: [
        { icon: Factory, label: "生産指示", path: "production-orders" },
        { icon: Boxes, label: "在庫", path: "inventory" },
        { icon: ShieldAlert, label: "品質課題", path: "quality" },
      ],
    },
    {
      category: "顧客・商談",
```

- [ ] **Step 3: コミット**

```bash
git add src/components/sidebar.tsx
git commit -m "feat: add production management navigation to sidebar"
```

---

### Task 13: ビルド検証・手動スモークテスト

**Files:**
- なし（検証のみ）

**Interfaces:**
- Consumes: Task 1〜12 の全成果物
- Produces: なし（最終確認）

- [ ] **Step 1: 型チェック・ビルド**

Run: `npm run build`
Expected: エラーなく成功し、`dist/` が生成される。エラーが出た場合は該当ファイル・行を修正して再実行する（よくある原因: Task 4 Step 5 で確認したエンティティセット名と `production-service.ts` の文字列リテラルの不一致）。

- [ ] **Step 2: Lint確認**

Run: `npm run lint`
Expected: エラーなく終了する（既存コードに存在する warning は無視してよいが、新規追加した `src/types/production.ts`, `src/services/production-service.ts`, `src/hooks/use-production.ts`, `src/pages/work-orders.tsx`, `src/pages/inventory.tsx`, `src/pages/quality.tsx`, `src/pages/production-dashboard.tsx`, `src/components/sidebar.tsx` にエラーが無いことを確認する）。

- [ ] **Step 3: 開発サーバー起動**

Run: `npm run dev`
Expected: Vite dev server が起動し、ローカルURL（例: `http://localhost:5173`）が表示される。

- [ ] **Step 4: 手動スモークテスト**

ブラウザで開発サーバーのURLを開き、以下を確認する:

1. サイドバーに「生産管理」カテゴリ（生産指示／在庫／品質課題）が表示される
2. `/dashboard` を開き、生産管理ダッシュボード（KPIカード4枚、ステータス内訳円グラフ、平均進捗率、納期が近い生産指示、在庫アラート、品質課題一覧、ステータス推移棒グラフ）が表示される（データが0件でもエラーにならないこと）
3. 「生産指示」ページで新規作成（指示番号・製品名・顧客・ライン・納期・数量・進捗・ステータスを入力）→ 一覧に反映される → 編集 → ステータス変更が反映される → 削除 → 一覧から消える、の一連が動作する
4. 「在庫」ページで新規作成→一覧反映→編集→削除が動作する。最小在庫以下の値を入れると「要補充」バッジが表示される
5. 「品質課題」ページで新規作成→一覧反映→編集→削除が動作する
6. 既存の「顧客」「商談」ページ（`/customers`, `/opportunities`）で新規作成が正常に動作する（Task 3 で新規作成したテーブルに対する動作確認を兼ねる）

Expected: 全項目が期待通りに動作する。エラーが出た場合はブラウザの開発者コンソールとネットワークタブでDataverse APIのレスポンスを確認し、該当タスクに戻って修正する。

- [ ] **Step 5: 最終コミット確認**

Run: `git log --oneline -15 && git status`
Expected: Task 1〜12 の各コミットが履歴に残っており、`git status` が clean（`.env`, `.auth_record.json`, `scripts/.venv/`, `.power/`, `node_modules/`, `dist/` 等gitignore対象を除く）であることを確認する。

