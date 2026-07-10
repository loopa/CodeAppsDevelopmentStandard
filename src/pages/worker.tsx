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
            disabled={updateItem.isPending || updateOrder.isPending}
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
      saveLabel="報告する"
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
