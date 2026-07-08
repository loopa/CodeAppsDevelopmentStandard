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
