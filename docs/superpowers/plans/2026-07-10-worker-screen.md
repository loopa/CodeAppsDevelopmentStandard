# 作業者画面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 現場作業者がタブレットから担当生産指示のチェックリスト消化・不具合報告・工程遷移を行えるキオスク風画面 `/worker` を追加する。

**Architecture:** Dataverse に geek_worker / geek_checklistitem テーブルと3つのルックアップを増分スクリプトで追加。既存の service → hooks → page の3層パターンを踏襲し、`/worker` は Layout の外の独立ルートとして実装。進捗%はチェック済み件数からクライアント側で自動計算して PATCH する。

**Tech Stack:** React 19 + Vite + TypeScript, @microsoft/power-apps SDK (Dataverse), React Query, shadcn/ui, sonner, Python (Dataverse プロビジョニング)

**Spec:** `docs/superpowers/specs/2026-07-10-worker-screen-design.md`

## Global Constraints

- UIラベル・トーストは日本語。既存ページの文言スタイルに合わせる。
- 全 mutation に `onError: () => toast.error("...に失敗しました")` を付与する（プロジェクト全体で統一済みのパターン）。
- 新しい npm 依存は追加しない。
- このリポジトリにはユニットテスト基盤がない。各タスクの検証は `npx tsc --noEmit`（0 エラー）で行い、最終タスクで Playwright スモークを実施する。
- Dataverse スキーマ: プレフィックスは `geek_`、日本語ローカライズ（LanguageCode 1041）必須。
- `npx power-apps add-data-source` は WSL で CachePersistenceError になるため使わない。新テーブルは `src/lib/dataSourcesInfo.ts` に手動エントリを追加する（geek_incidents で実績のあるパターン）。

---

### Task 1: Dataverse プロビジョニングスクリプト

**Files:**
- Create: `scripts/add_worker_tables.py`

**Interfaces:**
- Produces: Dataverse 上に `geek_worker`（列: geek_name）、`geek_checklistitem`（列: geek_name, geek_iscompleted, geek_sequence, geek_productionorderid ルックアップ）、`geek_productionorder.geek_workerid` ルックアップ、`geek_qualityissue.geek_productionorderid` ルックアップ。デモ作業者3名。

- [ ] **Step 1: スクリプトを作成**

`scripts/setup_dataverse.py` と同じ auth_helper ベース。増分実行専用（既存テーブルには触らない）。

```python
"""
作業者画面用の増分 Dataverse セットアップ
==========================================
追加内容:
  - geek_worker テーブル（作業者マスタ）
  - geek_checklistitem テーブル（チェック項目）
  - geek_productionorder.geek_workerid ルックアップ
  - geek_qualityissue.geek_productionorderid ルックアップ
  - 日本語ローカライズ + デモ作業者3名

実行: python scripts/add_worker_tables.py
"""
import os
import sys
import time
import traceback

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from auth_helper import (
    api_get,
    api_post,
    api_request,
    retry_metadata,
    DATAVERSE_URL,
)

PREFIX = os.environ["PUBLISHER_PREFIX"]
SOLUTION_NAME = os.environ["SOLUTION_NAME"]


def label_jp(text: str) -> dict:
    return {"LocalizedLabels": [{"Label": text, "LanguageCode": 1041}]}


def get_entity_set_name(logical_name: str) -> str:
    meta = api_get(f"EntityDefinitions(LogicalName='{logical_name}')?$select=EntitySetName")
    return meta["EntitySetName"]


TABLES = [
    {
        "logical": f"{PREFIX}_worker",
        "display": "Worker",
        "plural": "Workers",
        "description": "作業者マスタ",
        "columns": [],
    },
    {
        "logical": f"{PREFIX}_checklistitem",
        "display": "Checklist Item",
        "plural": "Checklist Items",
        "description": "チェック項目",
        "columns": [
            {"logical": f"{PREFIX}_iscompleted", "type": "Boolean", "display": "Is Completed"},
            {"logical": f"{PREFIX}_sequence", "type": "Integer", "display": "Sequence"},
        ],
    },
]

LOOKUPS = [
    {"schema": f"{PREFIX}_checklistitem_{PREFIX}_productionorder",
     "referencing": f"{PREFIX}_checklistitem", "referenced": f"{PREFIX}_productionorder",
     "lookup_attr": f"{PREFIX}_productionorderid", "lookup_display": "Production Order"},
    {"schema": f"{PREFIX}_productionorder_{PREFIX}_worker",
     "referencing": f"{PREFIX}_productionorder", "referenced": f"{PREFIX}_worker",
     "lookup_attr": f"{PREFIX}_workerid", "lookup_display": "Worker"},
    {"schema": f"{PREFIX}_qualityissue_{PREFIX}_productionorder",
     "referencing": f"{PREFIX}_qualityissue", "referenced": f"{PREFIX}_productionorder",
     "lookup_attr": f"{PREFIX}_productionorderid", "lookup_display": "Production Order"},
]

LOCALIZE_TABLES = [
    (f"{PREFIX}_worker", "作業者", "作業者"),
    (f"{PREFIX}_checklistitem", "チェック項目", "チェック項目"),
]

LOCALIZE_COLUMNS = [
    (f"{PREFIX}_worker", f"{PREFIX}_name", "氏名"),
    (f"{PREFIX}_checklistitem", f"{PREFIX}_name", "項目名"),
    (f"{PREFIX}_checklistitem", f"{PREFIX}_iscompleted", "完了"),
    (f"{PREFIX}_checklistitem", f"{PREFIX}_sequence", "表示順"),
    (f"{PREFIX}_checklistitem", f"{PREFIX}_productionorderid", "生産指示"),
    (f"{PREFIX}_productionorder", f"{PREFIX}_workerid", "担当作業者"),
    (f"{PREFIX}_qualityissue", f"{PREFIX}_productionorderid", "関連生産指示"),
]

DEMO_WORKERS = ["山田 太郎", "佐藤 花子", "鈴木 一郎"]


def build_column_body(col: dict) -> dict:
    base = {
        "SchemaName": col["logical"],
        "DisplayName": label_jp(col["display"]),
        "RequiredLevel": {"Value": "None"},
    }
    if col["type"] == "Integer":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.IntegerAttributeMetadata"
        base["MinValue"] = 0
        base["MaxValue"] = 100000
    elif col["type"] == "Boolean":
        base["@odata.type"] = "#Microsoft.Dynamics.CRM.BooleanAttributeMetadata"
        base["OptionSet"] = {
            "@odata.type": "#Microsoft.Dynamics.CRM.BooleanOptionSetMetadata",
            "TrueOption": {"Value": 1, "Label": label_jp("はい")},
            "FalseOption": {"Value": 0, "Label": label_jp("いいえ")},
        }
    return base


def create_tables():
    print("\n=== テーブル作成 ===")
    for tbl in TABLES:
        logical = tbl["logical"]
        try:
            api_get(f"EntityDefinitions(LogicalName='{logical}')?$select=MetadataId")
            print(f"  テーブル '{logical}' は既存。列補完のみ実施。")
        except Exception:
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
                api_post("EntityDefinitions", body, solution=SOLUTION_NAME)
                print(f"  テーブル '{logical}' 作成完了")
            retry_metadata(_create, f"テーブル {logical}")
            time.sleep(10)

        for col in tbl["columns"]:
            col_logical = col["logical"]
            try:
                api_get(f"EntityDefinitions(LogicalName='{logical}')/Attributes(LogicalName='{col_logical}')?$select=LogicalName")
                continue
            except Exception:
                pass

            def _add_col(c=col, ln=logical):
                api_post(
                    f"EntityDefinitions(LogicalName='{ln}')/Attributes",
                    build_column_body(c),
                    solution=SOLUTION_NAME,
                )
                print(f"    列 '{c['logical']}' 追加完了")
            retry_metadata(_add_col, f"列 {col_logical}")
            time.sleep(5)


def create_lookups():
    print("\n=== Lookup 作成 ===")
    for lk in LOOKUPS:
        referencing = lk["referencing"]
        attr = lk["lookup_attr"]
        try:
            api_get(f"EntityDefinitions(LogicalName='{referencing}')/Attributes(LogicalName='{attr}')?$select=LogicalName")
            print(f"  Lookup '{lk['schema']}' は既存。スキップ。")
            continue
        except Exception:
            pass

        def _create(l=lk):
            body = {
                "@odata.type": "#Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
                "SchemaName": l["schema"],
                "ReferencedEntity": l["referenced"],
                "ReferencingEntity": l["referencing"],
                "Lookup": {
                    "SchemaName": l["lookup_attr"],
                    "DisplayName": label_jp(l["lookup_display"]),
                    "RequiredLevel": {"Value": "None"},
                },
            }
            api_post("RelationshipDefinitions", body, solution=SOLUTION_NAME)
            print(f"  Lookup '{l['schema']}' 作成完了")
        retry_metadata(_create, f"Lookup {lk['schema']}")
        time.sleep(5)


def publish_all():
    print("\n  カスタマイズ公開中…")
    api_post("PublishAllXml", {})
    print("  公開完了")


def localize():
    print("\n=== 日本語ローカライズ ===")
    for logical, disp, plural in LOCALIZE_TABLES:
        data = api_get(f"EntityDefinitions(LogicalName='{logical}')?$select=MetadataId")
        mid = data["MetadataId"]
        body = {
            "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
            "MetadataId": mid,
            "DisplayName": label_jp(disp),
            "DisplayCollectionName": label_jp(plural),
        }
        api_request(f"EntityDefinitions({mid})", body, method="PUT")
        print(f"  テーブル '{logical}' → '{disp}'")

    odata_type_map = {
        "String": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
        "Lookup": "#Microsoft.Dynamics.CRM.LookupAttributeMetadata",
        "Integer": "#Microsoft.Dynamics.CRM.IntegerAttributeMetadata",
        "Boolean": "#Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
    }
    for table, col, disp in LOCALIZE_COLUMNS:
        data = api_get(
            f"EntityDefinitions(LogicalName='{table}')/Attributes(LogicalName='{col}')"
            f"?$select=MetadataId,AttributeType"
        )
        mid = data["MetadataId"]
        odata_type = odata_type_map.get(data.get("AttributeType", ""), "#Microsoft.Dynamics.CRM.AttributeMetadata")
        body = {
            "@odata.type": odata_type,
            "MetadataId": mid,
            "DisplayName": label_jp(disp),
        }
        api_request(f"EntityDefinitions(LogicalName='{table}')/Attributes({mid})", body, method="PUT")
        print(f"  列 '{table}.{col}' → '{disp}'")


def create_demo_workers():
    print("\n=== デモ作業者投入 ===")
    worker_set = get_entity_set_name(f"{PREFIX}_worker")
    existing = api_get(f"{worker_set}?$select={PREFIX}_name")
    existing_names = {r[f"{PREFIX}_name"] for r in existing.get("value", [])}
    for name in DEMO_WORKERS:
        if name in existing_names:
            print(f"  '{name}' は既存。スキップ。")
            continue
        api_post(worker_set, {f"{PREFIX}_name": name})
        print(f"  作業者 '{name}' 作成")


def ensure_solution_membership():
    print("\n=== ソリューション含有検証 ===")
    sols = api_get(f"solutions?$filter=uniquename eq '{SOLUTION_NAME}'&$select=solutionid")
    sol_id = sols["value"][0]["solutionid"]
    comps = api_get(
        f"solutioncomponents?$filter=_solutionid_value eq {sol_id} and componenttype eq 1&$select=objectid"
    )
    existing_ids = {c["objectid"] for c in comps.get("value", [])}
    for tbl in TABLES:
        logical = tbl["logical"]
        meta = api_get(f"EntityDefinitions(LogicalName='{logical}')?$select=MetadataId")
        meta_id = meta["MetadataId"]
        if meta_id in existing_ids:
            print(f"  ✅ {logical}: ソリューション内に存在")
        else:
            api_post("AddSolutionComponent", {
                "ComponentId": meta_id,
                "ComponentType": 1,
                "SolutionUniqueName": SOLUTION_NAME,
                "AddRequiredComponents": False,
                "DoNotIncludeSubcomponents": False,
            })
            print(f"  ➕ {logical}: 追加完了")


def verify():
    print("\n=== 検証 ===")
    for logical in [f"{PREFIX}_worker", f"{PREFIX}_checklistitem"]:
        entity_set = get_entity_set_name(logical)
        data = api_get(f"{entity_set}?$top=1&$select={PREFIX}_name")
        print(f"  ✅ {logical} → EntitySet: {entity_set} (rows>={len(data.get('value', []))})")
    for table, col in [
        (f"{PREFIX}_productionorder", f"{PREFIX}_workerid"),
        (f"{PREFIX}_qualityissue", f"{PREFIX}_productionorderid"),
        (f"{PREFIX}_checklistitem", f"{PREFIX}_productionorderid"),
    ]:
        api_get(f"EntityDefinitions(LogicalName='{table}')/Attributes(LogicalName='{col}')?$select=LogicalName")
        print(f"  ✅ {table}.{col}")


def main():
    print("=" * 60)
    print("  作業者画面用 Dataverse 増分セットアップ")
    print("=" * 60)
    print(f"  環境: {DATAVERSE_URL}")
    create_tables()
    create_lookups()
    publish_all()
    localize()
    publish_all()
    create_demo_workers()
    ensure_solution_membership()
    verify()
    print("\n✅ 完了!")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ エラー: {e}")
        traceback.print_exc()
        sys.exit(1)
```

注意: `auth_helper.py` はプロジェクトルートにある（`scripts/setup_dataverse.py` と同じ import 方法）。実行はプロジェクトルートから `python scripts/add_worker_tables.py`。既存スクリプトが `sys.path` なしで `from auth_helper import ...` できているのはルートから実行しているため。同じ前提で `sys.path.insert` は保険。

- [ ] **Step 2: スクリプトを実行**

Run: `cd /home/masaki/dev/factory-dx && .venv/bin/python scripts/add_worker_tables.py`（venv がなければ `python3`。`azure-identity requests python-dotenv` が必要）

Expected: `✅ 完了!` まで出力。`verify()` で EntitySet 名（通常 `geek_workers` / `geek_checklistitems`）が表示される。**この EntitySet 名を控える** — Task 2 以降で使う。異なる場合は Task 2〜4 のエンティティセット名を実際の値に合わせること。

- [ ] **Step 3: コミット**

```bash
git add scripts/add_worker_tables.py
git commit -m "chore: add incremental Dataverse setup for worker tables"
```

---

### Task 2: dataSourcesInfo に新テーブルを登録

**Files:**
- Modify: `src/lib/dataSourcesInfo.ts`

**Interfaces:**
- Produces: SDK `getClient(dataSourcesInfo)` から `geek_workers` / `geek_checklistitems` テーブルへアクセス可能になる。

- [ ] **Step 1: エントリ追加**

`geek_incidents` エントリの直後に追加（同ファイル既存パターン）:

```ts
  geek_workers: {
    tableId: "geek_worker",
    version: "",
    primaryKey: "geek_workerid",
    dataSourceType: "Dataverse",
    apis: {},
  },
  geek_checklistitems: {
    tableId: "geek_checklistitem",
    version: "",
    primaryKey: "geek_checklistitemid",
    dataSourceType: "Dataverse",
    apis: {},
  },
```

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラー 0

- [ ] **Step 3: コミット**

```bash
git add src/lib/dataSourcesInfo.ts
git commit -m "feat: register worker and checklist tables as data sources"
```

---

### Task 3: 型定義

**Files:**
- Modify: `src/types/production.ts`

**Interfaces:**
- Produces（後続タスクが依存する正確な型）:
  - `Worker { id: string; name: string }` / `WorkerRecord`
  - `ChecklistItem { id: string; name: string; isCompleted: boolean; sequence: number; productionOrderId: string }` / `ChecklistItemRecord` / `ChecklistItemCreate { name; isCompleted; sequence; productionOrderId }`
  - `ProductionOrderRecord` に `_geek_workerid_value?: string`、`ProductionOrder` に `workerId: string`、`ProductionOrderCreate` に `workerId: string`
  - `QualityIssueRecord` に `_geek_productionorderid_value?: string`、`QualityIssue` に `productionOrderId: string`、`QualityIssueCreate` に `productionOrderId?: string`

- [ ] **Step 1: 既存インターフェースへの追記**

`ProductionOrderRecord` に追加:
```ts
  _geek_workerid_value?: string;
```

`ProductionOrder` に追加:
```ts
  workerId: string;
```

`ProductionOrderCreate` に追加:
```ts
  workerId: string;
```

`QualityIssueRecord` に追加:
```ts
  _geek_productionorderid_value?: string;
```

`QualityIssue` に追加:
```ts
  productionOrderId: string;
```

`QualityIssueCreate` に追加:
```ts
  productionOrderId?: string;
```

- [ ] **Step 2: 新規型をファイル末尾に追加**

```ts
// ── 作業者 (geek_worker) ──
export interface WorkerRecord {
  [key: string]: unknown;
  geek_workerid: string;
  geek_name: string;
}

export interface Worker {
  [key: string]: unknown;
  id: string;
  name: string;
}

// ── チェック項目 (geek_checklistitem) ──
export interface ChecklistItemRecord {
  [key: string]: unknown;
  geek_checklistitemid: string;
  geek_name: string;
  geek_iscompleted?: boolean;
  geek_sequence?: number;
  _geek_productionorderid_value?: string;
}

export interface ChecklistItem {
  [key: string]: unknown;
  id: string;
  name: string;
  isCompleted: boolean;
  sequence: number;
  productionOrderId: string;
}

export interface ChecklistItemCreate {
  name: string;
  isCompleted: boolean;
  sequence: number;
  productionOrderId: string;
}
```

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: `work-orders.tsx` で `ProductionOrderCreate.workerId` 欠落エラーが出る可能性がある（`formData as ProductionOrderCreate` キャストのため実際は出ない想定）。エラーが出た場合は Task 7 で直すためここでは `workerId` を optional にせず、`work-orders.tsx` の `doSubmit` の `data` に `workerId: customerId ? customerId : ""` を**加えず**、暫定で `workerId: ""` を追加してよい（Task 7 で正式実装に置き換える）。
Expected 最終: エラー 0

- [ ] **Step 4: コミット**

```bash
git add src/types/production.ts src/pages/work-orders.tsx
git commit -m "feat: add worker and checklist item types"
```

---

### Task 4: サービス層

**Files:**
- Modify: `src/services/production-service.ts`

**Interfaces:**
- Consumes: Task 3 の型
- Produces（後続タスクが呼ぶ正確なシグネチャ）:
  - `getWorkers(): Promise<Worker[]>`
  - `getChecklistItems(orderId: string): Promise<ChecklistItem[]>`
  - `createChecklistItem(data: ChecklistItemCreate)`
  - `updateChecklistItem(id: string, data: Partial<ChecklistItemCreate>)`
  - `deleteChecklistItem(id: string)`
  - `getProductionOrders` の戻り値に `workerId` が含まれる
  - `createProductionOrder` / `updateProductionOrder` が `workerId` を `@odata.bind` で処理
  - `getQualityIssues` の戻り値に `productionOrderId` が含まれる
  - `createQualityIssue` が `productionOrderId` を `@odata.bind` で処理

- [ ] **Step 1: import に型を追加**

```ts
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
  Worker,
  WorkerRecord,
  ChecklistItem,
  ChecklistItemCreate,
  ChecklistItemRecord,
} from "@/types/production";
```

- [ ] **Step 2: getProductionOrders に workerId を追加**

select 配列に `"_geek_workerid_value"` を追加し、map に:
```ts
    workerId: r._geek_workerid_value ?? "",
```

- [ ] **Step 3: createProductionOrder / updateProductionOrder に workerId バインドを追加**

`createProductionOrder` の `if (data.customerId) {...}` の直後:
```ts
  if (data.workerId) {
    body["geek_workerid@odata.bind"] = `/geek_workers(${data.workerId})`;
  }
```

`updateProductionOrder` の `if (data.customerId) {...}` の直後にも同じ2行を追加。

- [ ] **Step 4: getQualityIssues / createQualityIssue に生産指示紐づけを追加**

`getQualityIssues` の select に `"_geek_productionorderid_value"` を追加し、map に:
```ts
    productionOrderId: r._geek_productionorderid_value ?? "",
```

`createQualityIssue` の body 構築を変更:
```ts
export async function createQualityIssue(data: QualityIssueCreate) {
  const body: Record<string, unknown> = {
    geek_title: data.title,
    geek_category: QualityCategoryValues[data.category],
    geek_severity: QualitySeverityValues[data.severity],
    geek_status: QualityStatusValues[data.status],
    geek_description: data.description,
  };
  if (data.productionOrderId) {
    body["geek_productionorderid@odata.bind"] = `/geek_productionorders(${data.productionOrderId})`;
  }
  const result = await client().createRecordAsync<typeof body, QualityIssueRecord>(
    "geek_qualityissues",
    body,
  );
  if (!result.success) throw result.error;
  return result.data;
}
```

- [ ] **Step 5: 作業者・チェック項目のセクションをファイル末尾に追加**

```ts
// ── 作業者 ──
export async function getWorkers(): Promise<Worker[]> {
  const result = await client().retrieveMultipleRecordsAsync<WorkerRecord>("geek_workers", {
    select: ["geek_workerid", "geek_name"],
    orderBy: ["geek_name asc"],
  });
  if (!result.success) throw result.error;
  return (result.data ?? []).map((r) => ({
    id: r.geek_workerid,
    name: r.geek_name,
  }));
}

// ── チェック項目 ──
export async function getChecklistItems(orderId: string): Promise<ChecklistItem[]> {
  const result = await client().retrieveMultipleRecordsAsync<ChecklistItemRecord>("geek_checklistitems", {
    select: ["geek_checklistitemid", "geek_name", "geek_iscompleted", "geek_sequence", "_geek_productionorderid_value"],
    filter: `_geek_productionorderid_value eq '${orderId}'`,
    orderBy: ["geek_sequence asc"],
  });
  if (!result.success) throw result.error;
  return (result.data ?? []).map((r) => ({
    id: r.geek_checklistitemid,
    name: r.geek_name,
    isCompleted: r.geek_iscompleted ?? false,
    sequence: r.geek_sequence ?? 0,
    productionOrderId: r._geek_productionorderid_value ?? "",
  }));
}

export async function createChecklistItem(data: ChecklistItemCreate) {
  const body: Record<string, unknown> = {
    geek_name: data.name,
    geek_iscompleted: data.isCompleted,
    geek_sequence: data.sequence,
    "geek_productionorderid@odata.bind": `/geek_productionorders(${data.productionOrderId})`,
  };
  const result = await client().createRecordAsync<typeof body, ChecklistItemRecord>(
    "geek_checklistitems",
    body,
  );
  if (!result.success) throw result.error;
  return result.data;
}

export async function updateChecklistItem(id: string, data: Partial<ChecklistItemCreate>) {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body.geek_name = data.name;
  if (data.isCompleted !== undefined) body.geek_iscompleted = data.isCompleted;
  if (data.sequence !== undefined) body.geek_sequence = data.sequence;
  const result = await client().updateRecordAsync<typeof body, ChecklistItemRecord>(
    "geek_checklistitems",
    id,
    body,
  );
  if (!result.success) throw result.error;
  return result.data;
}

export async function deleteChecklistItem(id: string) {
  const result = await client().deleteRecordAsync("geek_checklistitems", id);
  if (!result.success) throw result.error;
}
```

- [ ] **Step 6: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラー 0

- [ ] **Step 7: コミット**

```bash
git add src/services/production-service.ts
git commit -m "feat: add worker and checklist service functions"
```

---

### Task 5: React Query フック

**Files:**
- Modify: `src/hooks/use-production.ts`

**Interfaces:**
- Consumes: Task 4 のサービス関数
- Produces（後続タスクが呼ぶ正確なフック）:
  - `useWorkers()` → `useQuery<Worker[]>`
  - `useChecklistItems(orderId: string)` → `useQuery<ChecklistItem[]>`（orderId 空なら `enabled: false`）
  - `useCreateChecklistItem()` / `useUpdateChecklistItem()` / `useDeleteChecklistItem()` — mutate/mutateAsync。成功時に `["checklistItems"]` を invalidate

- [ ] **Step 1: import 追加**

```ts
import {
  getProductionOrders, createProductionOrder, updateProductionOrder, deleteProductionOrder,
  getInventoryItems, createInventoryItem, updateInventoryItem, deleteInventoryItem,
  getQualityIssues, createQualityIssue, updateQualityIssue, deleteQualityIssue,
  getWorkers, getChecklistItems, createChecklistItem, updateChecklistItem, deleteChecklistItem,
} from "@/services/production-service";
import type { ProductionOrderCreate, InventoryItemCreate, QualityIssueCreate, ChecklistItemCreate } from "@/types/production";
```

- [ ] **Step 2: フックをファイル末尾に追加**

```ts
// ── 作業者 hooks ──
export function useWorkers() {
  return useQuery({ queryKey: ["workers"], queryFn: getWorkers });
}

// ── チェック項目 hooks ──
export function useChecklistItems(orderId: string) {
  return useQuery({
    queryKey: ["checklistItems", orderId],
    queryFn: () => getChecklistItems(orderId),
    enabled: !!orderId,
  });
}
export function useCreateChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ChecklistItemCreate) => createChecklistItem(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklistItems"] }),
  });
}
export function useUpdateChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ChecklistItemCreate> }) =>
      updateChecklistItem(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklistItems"] }),
  });
}
export function useDeleteChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteChecklistItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklistItems"] }),
  });
}
```

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラー 0

- [ ] **Step 4: コミット**

```bash
git add src/hooks/use-production.ts
git commit -m "feat: add worker and checklist React Query hooks"
```

---

### Task 6: 作業者画面 `/worker`

**Files:**
- Create: `src/pages/worker.tsx`
- Modify: `src/router.tsx`

**Interfaces:**
- Consumes: Task 5 のフック、Task 3 の型
- Produces: ルート `/worker`。localStorage キー `factory-dx-worker-id`。

- [ ] **Step 1: worker.tsx を作成**

```tsx
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormModal } from "@/components/form-modal";
import { LoadingSkeletonGrid } from "@/components/loading-skeleton";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, AlertTriangle, UserRound, CalendarDays } from "lucide-react";
import {
  useWorkers, useProductionOrders, useChecklistItems,
  useUpdateChecklistItem, useUpdateProductionOrder, useCreateQualityIssue,
} from "@/hooks/use-production";
import {
  QualityCategoryValues, QualitySeverityValues,
  type Worker, type ProductionOrder, type ProductionOrderStatus, type ChecklistItem,
  type QualityCategory, type QualitySeverity, type QualityIssueCreate,
} from "@/types/production";

const STORAGE_KEY = "factory-dx-worker-id";
const STATUS_FLOW: ProductionOrderStatus[] = ["設計中", "部品調達", "組立中", "検査待ち", "出荷済み", "完了"];

export default function WorkerPage() {
  const [workerId, setWorkerId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const { data: workers = [], isLoading: loadingWorkers } = useWorkers();
  const { data: orders = [], isLoading: loadingOrders } = useProductionOrders();

  const worker = useMemo(() => workers.find((w) => w.id === workerId) ?? null, [workers, workerId]);

  // localStorage の作業者が削除済みなら選択画面に戻す
  useEffect(() => {
    if (!loadingWorkers && workerId && !worker) {
      localStorage.removeItem(STORAGE_KEY);
      setWorkerId(null);
    }
  }, [loadingWorkers, workerId, worker]);

  const myOrders = useMemo(
    () => orders.filter((o) => o.workerId === workerId && o.status !== "完了" && o.status !== "出荷済み"),
    [orders, workerId],
  );
  const activeOrder = useMemo(
    () => myOrders.find((o) => o.id === activeOrderId) ?? null,
    [myOrders, activeOrderId],
  );

  const selectWorker = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setWorkerId(id);
    setActiveOrderId(null);
  };
  const switchWorker = () => {
    localStorage.removeItem(STORAGE_KEY);
    setWorkerId(null);
    setActiveOrderId(null);
  };

  if (loadingWorkers || loadingOrders) {
    return (
      <div className="min-h-dvh bg-background p-6">
        <LoadingSkeletonGrid columns={2} count={4} variant="compact" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {activeOrder && (
            <Button variant="ghost" size="icon" className="h-12 w-12" onClick={() => setActiveOrderId(null)} aria-label="一覧に戻る">
              <ArrowLeft className="h-6 w-6" />
            </Button>
          )}
          <h1 className="text-xl font-bold">
            {activeOrder ? `${activeOrder.orderNumber} / ${activeOrder.productName}` : "作業者画面"}
          </h1>
        </div>
        {worker && (
          <Button variant="outline" size="lg" onClick={switchWorker} className="gap-2 h-12">
            <UserRound className="h-5 w-5" />
            {worker.name}（切替）
          </Button>
        )}
      </header>

      <main className="p-4 md:p-6 max-w-3xl mx-auto">
        {!worker ? (
          <WorkerSelect workers={workers} onSelect={selectWorker} />
        ) : activeOrder ? (
          <OrderDetail order={activeOrder} />
        ) : (
          <OrderList orders={myOrders} onSelect={setActiveOrderId} />
        )}
      </main>
    </div>
  );
}

// ── 作業者選択 ──
function WorkerSelect({ workers, onSelect }: { workers: Worker[]; onSelect: (id: string) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-center">名前を選んでください</h2>
      {workers.length === 0 && (
        <p className="text-center text-muted-foreground">作業者が登録されていません</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {workers.map((w) => (
          <Button
            key={w.id}
            variant="outline"
            className="h-20 text-xl font-semibold"
            onClick={() => onSelect(w.id)}
          >
            <UserRound className="h-6 w-6 mr-2" />
            {w.name}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ── 担当指示一覧 ──
function OrderList({ orders, onSelect }: { orders: ProductionOrder[]; onSelect: (id: string) => void }) {
  if (orders.length === 0) {
    return <p className="text-center text-muted-foreground py-12 text-lg">担当作業はありません</p>;
  }
  return (
    <div className="space-y-4">
      {orders.map((o) => (
        <Card key={o.id} className="cursor-pointer hover:shadow-md active:scale-[0.99] transition" onClick={() => onSelect(o.id)}>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-lg font-bold">{o.orderNumber} / {o.productName}</p>
              <Badge variant="secondary" className="text-sm shrink-0">{o.status}</Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              納期 {o.dueDate ? new Date(o.dueDate).toLocaleDateString("ja-JP") : "未設定"}
              <span className="mx-1">・</span>数量 {o.quantity}
            </div>
            <div className="flex items-center gap-3">
              <Progress value={o.progress} className="h-3" />
              <span className="text-sm font-semibold w-12 text-right">{o.progress}%</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── 指示詳細（作業画面） ──
function OrderDetail({ order }: { order: ProductionOrder }) {
  const { data: items = [], isLoading } = useChecklistItems(order.id);
  const updateItem = useUpdateChecklistItem();
  const updateOrder = useUpdateProductionOrder();
  const [reportOpen, setReportOpen] = useState(false);

  const handleToggle = (item: ChecklistItem) => {
    const newValue = !item.isCompleted;
    updateItem.mutate(
      { id: item.id, data: { isCompleted: newValue } },
      {
        onSuccess: () => {
          const completed = items.filter((i) => (i.id === item.id ? newValue : i.isCompleted)).length;
          updateOrder.mutate(
            { id: order.id, data: { progress: Math.round((completed / items.length) * 100) } },
            { onError: () => toast.error("進捗の更新に失敗しました") },
          );
        },
        onError: () => toast.error("チェックの更新に失敗しました"),
      },
    );
  };

  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + 1];

  return (
    <div className="space-y-6">
      {/* 進捗サマリ */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="text-sm">{order.status}</Badge>
            <span className="text-sm text-muted-foreground">
              納期 {order.dueDate ? new Date(order.dueDate).toLocaleDateString("ja-JP") : "未設定"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Progress value={order.progress} className="h-4" />
            <span className="text-lg font-bold w-14 text-right">{order.progress}%</span>
          </div>
        </CardContent>
      </Card>

      {/* チェックリスト */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">チェックリスト</h2>
        {isLoading && <p className="text-muted-foreground">読み込み中...</p>}
        {!isLoading && items.length === 0 && (
          <p className="text-muted-foreground">チェック項目が設定されていません</p>
        )}
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={updateItem.isPending}
            onClick={() => handleToggle(item)}
            className={`w-full flex items-center gap-4 rounded-lg border p-4 text-left transition active:scale-[0.99] ${
              item.isCompleted ? "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-800" : "hover:bg-muted/50"
            }`}
          >
            {item.isCompleted ? (
              <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
            ) : (
              <Circle className="h-8 w-8 text-muted-foreground shrink-0" />
            )}
            <span className={`text-lg ${item.isCompleted ? "line-through text-muted-foreground" : "font-medium"}`}>
              {item.name}
            </span>
          </button>
        ))}
      </div>

      {/* アクション */}
      <div className="space-y-3">
        {nextStatus && (
          <Button
            size="lg"
            className="w-full h-14 text-lg"
            disabled={updateOrder.isPending}
            onClick={() =>
              updateOrder.mutate(
                { id: order.id, data: { status: nextStatus } },
                {
                  onSuccess: () => toast.success(`ステータスを「${nextStatus}」に変更しました`),
                  onError: () => toast.error("ステータスの更新に失敗しました"),
                },
              )
            }
          >
            次の工程へ進む（{nextStatus}）
            <ArrowRight className="h-5 w-5 ml-2" />
          </Button>
        )}
        <Button variant="outline" size="lg" className="w-full h-14 text-lg" onClick={() => setReportOpen(true)}>
          <AlertTriangle className="h-5 w-5 mr-2 text-amber-500" />
          不具合を報告
        </Button>
      </div>

      <QualityReportModal order={order} open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  );
}

// ── 不具合報告モーダル ──
function QualityReportModal({
  order, open, onOpenChange,
}: {
  order: ProductionOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createIssue = useCreateQualityIssue();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<QualityCategory>("その他");
  const [severity, setSeverity] = useState<QualitySeverity>("軽微");
  const [description, setDescription] = useState("");

  const handleSave = () => {
    if (!title.trim()) return;
    const data: QualityIssueCreate = {
      title,
      category,
      severity,
      status: "未着手",
      description,
      productionOrderId: order.id,
    };
    createIssue.mutate(data, {
      onSuccess: () => {
        toast.success("不具合を報告しました");
        setTitle("");
        setCategory("その他");
        setSeverity("軽微");
        setDescription("");
        onOpenChange(false);
      },
      onError: () => toast.error("不具合の報告に失敗しました"),
    });
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={`不具合を報告（${order.orderNumber}）`}
      onSave={handleSave}
      isSaving={createIssue.isPending}
    >
      <div className="space-y-4">
        <div>
          <Label>タイトル *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>
        <div>
          <Label>詳細説明</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
        </div>
      </div>
    </FormModal>
  );
}
```

注意: `FormModal` の props は `quality.tsx` の使用例（open / onOpenChange / title / onSave / isSaving / children）に合わせている。実装時に `src/components/form-modal.tsx` を確認し、`saveLabel` 等の追加 props があれば「報告する」を渡してよい。

- [ ] **Step 2: router.tsx にルート追加**

lazy import を追加:
```tsx
// 作業者画面（キオスク）
const WorkerPage = lazy(() => import("@/pages/worker"));
```

`createBrowserRouter` の配列に、既存の `path: "/"` オブジェクトと**同列**（Layout の外）に追加:
```tsx
    {
      path: "/worker",
      element: withSuspense(WorkerPage),
      errorElement: withSuspense(NotFoundPage),
    },
```

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラー 0

- [ ] **Step 4: コミット**

```bash
git add src/pages/worker.tsx src/router.tsx
git commit -m "feat: add kiosk-style worker screen at /worker"
```

---

### Task 7: 事務所側 — 生産指示フォームに担当作業者とチェックリスト編集を追加

**Files:**
- Modify: `src/pages/work-orders.tsx`

**Interfaces:**
- Consumes: `useWorkers`, `useChecklistItems`, `useCreateChecklistItem`, `useDeleteChecklistItem`（Task 5）、`ProductionOrderCreate.workerId`（Task 3）
- Produces: フォームから担当作業者の割当とチェック項目の追加・削除が可能になる。

- [ ] **Step 1: import とフックを追加**

import に追加:
```tsx
import {
  useProductionOrders, useCreateProductionOrder, useUpdateProductionOrder, useDeleteProductionOrder,
  useWorkers, useChecklistItems, useCreateChecklistItem, useDeleteChecklistItem,
} from "@/hooks/use-production";
import type { Worker, ChecklistItem } from "@/types/production";
```

`WorkOrdersPage` コンポーネント冒頭（既存の mutation 宣言の後）に追加:
```tsx
  const { data: workers = [] } = useWorkers();
  const { data: existingChecklist = [] } = useChecklistItems(editItem?.id ?? "");
  const createChecklistMutation = useCreateChecklistItem();
  const deleteChecklistMutation = useDeleteChecklistItem();
```

- [ ] **Step 2: チェックリスト差分同期関数と handleSave の変更**

`handleSave` を以下に置き換え:
```tsx
  type ChecklistDraft = { id?: string; name: string };

  const syncChecklist = async (orderId: string, draft: ChecklistDraft[]) => {
    const keptIds = new Set(draft.filter((d) => d.id).map((d) => d.id));
    const removed = existingChecklist.filter((i) => !keptIds.has(i.id));
    const added = draft.filter((d) => !d.id);
    const maxSeq = existingChecklist.reduce((m, i) => Math.max(m, i.sequence), 0);
    try {
      await Promise.all([
        ...removed.map((i) => deleteChecklistMutation.mutateAsync(i.id)),
        ...added.map((d, idx) =>
          createChecklistMutation.mutateAsync({
            name: d.name,
            isCompleted: false,
            sequence: maxSeq + idx + 1,
            productionOrderId: orderId,
          }),
        ),
      ]);
    } catch {
      toast.error("チェックリストの保存に失敗しました");
    }
  };

  const handleSave = (formData: Partial<ProductionOrderCreate>, checklist: ChecklistDraft[]) => {
    if (editItem) {
      updateMutation.mutate(
        { id: editItem.id, data: formData },
        {
          onSuccess: async () => {
            await syncChecklist(editItem.id, checklist);
            setIsFormOpen(false);
            setEditItem(null);
          },
          onError: () => { toast.error("生産指示の更新に失敗しました"); },
        },
      );
    } else {
      createMutation.mutate(formData as ProductionOrderCreate, {
        onSuccess: async (created) => {
          const newId = created?.geek_productionorderid;
          if (newId && checklist.length > 0) await syncChecklist(newId, checklist);
          setIsFormOpen(false);
        },
        onError: () => { toast.error("生産指示の作成に失敗しました"); },
      });
    }
  };
```

- [ ] **Step 3: WorkOrderForm に担当作業者 Select とチェックリスト編集 UI を追加**

`WorkOrderForm` の props に `workers: Worker[]` と `existingChecklist: ChecklistItem[]` を追加し、`onSubmit` の型を `(data: Partial<ProductionOrderCreate>, checklist: { id?: string; name: string }[]) => void` に変更。呼び出し側（`<WorkOrderForm ...>`）にも `workers={workers}` `existingChecklist={existingChecklist}` を渡す。

`WorkOrderForm` 内に state を追加:
```tsx
  const [workerId, setWorkerId] = useState(item?.workerId ?? "");
  const [checklist, setChecklist] = useState<{ id?: string; name: string }[]>(
    existingChecklist.map((i) => ({ id: i.id, name: i.name })),
  );
  const [newItemName, setNewItemName] = useState("");

  const addChecklistItem = () => {
    const name = newItemName.trim();
    if (!name) return;
    setChecklist((prev) => [...prev, { name }]);
    setNewItemName("");
  };
  const removeChecklistItem = (index: number) => {
    setChecklist((prev) => prev.filter((_, i) => i !== index));
  };
```

`doSubmit` の `data` に `workerId,` を追加し、`onSubmit(data)` を `onSubmit(data, checklist)` に変更。

「顧客」Select の隣（同じ grid 内か新しい行）に担当作業者 Select を追加:
```tsx
        <div>
          <Label>担当作業者</Label>
          <Select value={workerId} onValueChange={setWorkerId}>
            <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
            <SelectContent>
              {workers.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
```

ステータス行の後・削除ボタンの前にチェックリスト編集 UI を追加:
```tsx
      <div className="space-y-2 pt-2 border-t">
        <Label>チェックリスト</Label>
        {checklist.map((c, index) => (
          <div key={c.id ?? `new-${index}`} className="flex items-center gap-2">
            <span className="flex-1 text-sm border rounded-md px-3 py-2 bg-muted/30">{c.name}</span>
            <Button type="button" variant="ghost" size="icon" onClick={() => removeChecklistItem(index)} aria-label="項目を削除">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Input
            placeholder="項目を追加..."
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChecklistItem(); } }}
          />
          <Button type="button" variant="outline" onClick={addChecklistItem}>
            <Plus className="h-4 w-4 mr-1" />追加
          </Button>
        </div>
      </div>
```

注意: Task 3 Step 3 で暫定追加した `workerId: ""` があればこの正式実装に置き換える。フォームを開き直したときに `existingChecklist` の初期値がまだロード中のことがあるため、`WorkOrderForm` に `key={editItem?.id ?? "new"}` を付けて `FormModal` 内でリマウントさせる（`existingChecklist` はロード完了後に再マウントで反映される。編集中の上書きは発生しない）。

- [ ] **Step 4: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラー 0

- [ ] **Step 5: コミット**

```bash
git add src/pages/work-orders.tsx
git commit -m "feat: assign worker and edit checklist from work order form"
```

---

### Task 8: 事務所側 — 品質課題一覧に関連指示番号列を追加

**Files:**
- Modify: `src/pages/quality.tsx`

**Interfaces:**
- Consumes: `useProductionOrders`（既存）、`QualityIssue.productionOrderId`（Task 3/4）

- [ ] **Step 1: 列を追加**

import に `useProductionOrders` を追加:
```tsx
import {
  useQualityIssues, useCreateQualityIssue, useUpdateQualityIssue, useDeleteQualityIssue,
  useProductionOrders,
} from "@/hooks/use-production";
```

`QualityPage` 冒頭に追加:
```tsx
  const { data: orders = [] } = useProductionOrders();
  const orderNumberMap = useMemo(() => {
    const m = new Map<string, string>();
    orders.forEach((o) => m.set(o.id, o.orderNumber));
    return m;
  }, [orders]);
```

`columns` の「カテゴリ」列の前に追加し、`useMemo` の依存配列に `orderNumberMap` を追加:
```tsx
    {
      key: "productionOrderId", label: "関連指示",
      render: (item) =>
        item.productionOrderId ? (
          <span className="text-xs">{orderNumberMap.get(item.productionOrderId) ?? ""}</span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
```

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラー 0

- [ ] **Step 3: コミット**

```bash
git add src/pages/quality.tsx
git commit -m "feat: show related order number on quality issue list"
```

---

### Task 9: ビルド検証と Playwright スモーク

**Files:**
- なし（検証のみ）

- [ ] **Step 1: ビルド**

Run: `npm run build`
Expected: `tsc -b` と `vite build` が成功

- [ ] **Step 2: dev サーバー起動と Playwright スモーク**

Run: `npm run dev`（バックグラウンド）。Playwright MCP ブラウザで以下を確認:

1. `http://localhost:3000/worker`（ポートは dev サーバー出力に合わせる）を開く → 作業者選択画面に「山田 太郎」等のデモ作業者が表示される
2. 作業者をタップ → 一覧画面へ遷移（担当指示がなければ「担当作業はありません」）
3. 事務所画面 `http://localhost:3000/production-orders` で既存指示を開き、担当作業者に選択した作業者を設定・チェック項目を2件追加して保存
4. `/worker` に戻る → 指示カードが表示される → タップ → チェック項目をタップ → 進捗が 50% に変わる（トースト/バーで確認）
5. 「不具合を報告」→ タイトル入力 → 保存 → `/quality` の一覧に関連指示番号付きで表示される
6. 「次の工程へ進む」→ ステータスバッジが変わる

Expected: 各ステップでエラーなし。コンソールに未処理エラーが出ていないことを `browser_console_messages` で確認。

- [ ] **Step 3: スクリーンショット保存（任意）と最終コミット**

未コミットの修正が出た場合はここで修正・コミットする。

```bash
git status --short
```

Expected: クリーン（または意図した修正のみ）
