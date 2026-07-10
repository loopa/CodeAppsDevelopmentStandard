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
    workerId: r._geek_workerid_value ?? "",
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
  if (data.customerId) {
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
    productionOrderId: r._geek_productionorderid_value ?? "",
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
