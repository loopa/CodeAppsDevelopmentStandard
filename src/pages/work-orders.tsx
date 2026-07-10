import { useMemo, useState, useRef } from "react";
import { ListTable, type TableColumn, type FilterConfig } from "@/components/list-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useProductionOrders, useCreateProductionOrder, useUpdateProductionOrder, useDeleteProductionOrder,
  useWorkers, useChecklistItems, useCreateChecklistItem, useDeleteChecklistItem,
} from "@/hooks/use-production";
import { useCustomers } from "@/hooks/use-dataverse";
import {
  ProductionOrderStatusValues, type ProductionOrder, type ProductionOrderCreate, type ProductionOrderStatus,
} from "@/types/production";
import type { Worker, ChecklistItem } from "@/types/production";
import { LoadingSkeletonCard } from "@/components/loading-skeleton";
import { FormModal } from "@/components/form-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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

  const { data: workers = [] } = useWorkers();
  const { data: existingChecklist = [] } = useChecklistItems(editItem?.id ?? "");
  const createChecklistMutation = useCreateChecklistItem();
  const deleteChecklistMutation = useDeleteChecklistItem();

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
          key={editItem?.id ?? "new"}
          item={editItem}
          customers={customers}
          workers={workers}
          existingChecklist={existingChecklist}
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
              onError: () => { toast.error("生産指示の削除に失敗しました"); },
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
  item, customers, workers, existingChecklist, onSubmit, onDelete, submitRef,
}: {
  item: ProductionOrder | null;
  customers: { geek_customerid: string; geek_name: string }[];
  workers: Worker[];
  existingChecklist: ChecklistItem[];
  onSubmit: (data: Partial<ProductionOrderCreate>, checklist: { id?: string; name: string }[]) => void;
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

  const doSubmit = () => {
    if (!orderNumber.trim()) return;
    const data: Partial<ProductionOrderCreate> = {
      orderNumber,
      productName,
      customerId,
      workerId,
      line,
      dueDate,
      quantity: Number(quantity) || 0,
      progress: Number(progress) || 0,
      status,
    };
    onSubmit(data, checklist);
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
