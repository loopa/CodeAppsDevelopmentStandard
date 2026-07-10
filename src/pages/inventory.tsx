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
import { toast } from "sonner";

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
        {
          onSuccess: () => { setIsFormOpen(false); setEditItem(null); },
          onError: () => { toast.error("在庫の更新に失敗しました"); },
        },
      );
    } else {
      createMutation.mutate(formData as InventoryItemCreate, {
        onSuccess: () => { setIsFormOpen(false); },
        onError: () => { toast.error("在庫の作成に失敗しました"); },
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
              onError: () => { toast.error("在庫の削除に失敗しました"); },
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
