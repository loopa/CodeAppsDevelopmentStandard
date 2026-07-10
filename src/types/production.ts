// 生産管理 型定義

// ── 生産指示 (geek_productionorder) ──
export interface ProductionOrderRecord {
  [key: string]: unknown;
  geek_productionorderid: string;
  geek_ordernumber: string;
  geek_productname?: string;
  _geek_customerid_value?: string;
  _geek_workerid_value?: string;
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
  [key: string]: unknown;
  id: string;
  orderNumber: string;
  productName: string;
  customerId: string;
  customer: string;
  workerId: string;
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
  workerId: string;
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
  [key: string]: unknown;
  id: string;
  partNumber: string;
  partName: string;
  stock: number;
  minStock: number;
}

export interface InventoryItemCreate {
  partNumber: string;
  partName: string;
  stock: number;
  minStock: number;
}

// ── 品質課題 (geek_qualityissue) ──
export interface QualityIssueRecord {
  [key: string]: unknown;
  geek_qualityissueid: string;
  geek_title: string;
  geek_category?: number;
  geek_severity?: number;
  geek_status?: number;
  geek_description?: string;
  _geek_productionorderid_value?: string;
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
  [key: string]: unknown;
  id: string;
  title: string;
  category: QualityCategory;
  severity: QualitySeverity;
  status: QualityStatus;
  description: string;
  productionOrderId: string;
}

export interface QualityIssueCreate {
  title: string;
  category: QualityCategory;
  severity: QualitySeverity;
  status: QualityStatus;
  description: string;
  productionOrderId?: string;
}

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
