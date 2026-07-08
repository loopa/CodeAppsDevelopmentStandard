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
