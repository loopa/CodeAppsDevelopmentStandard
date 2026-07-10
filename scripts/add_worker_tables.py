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
    if not sols.get("value"):
        print(f"  ❌ ソリューション '{SOLUTION_NAME}' が見つかりません")
        return
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
