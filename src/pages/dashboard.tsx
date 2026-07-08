import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getInventoryItems, getProductionOrders, getQualityIssues } from "@/services/production-service";
import { LoadingSkeletonGrid } from "@/components/loading-skeleton";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
// No icon imports are required for this page.
const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

export default function DashboardPage() {
  const { data: orders = [], isLoading: isLoadingOrders } = useQuery({
    queryKey: ["productionOrders"],
    queryFn: getProductionOrders,
  });
  const { data: inventoryItems = [], isLoading: isLoadingInventory } = useQuery({
    queryKey: ["inventoryItems"],
    queryFn: getInventoryItems,
  });
  const { data: qualityIssues = [], isLoading: isLoadingQuality } = useQuery({
    queryKey: ["qualityIssues"],
    queryFn: getQualityIssues,
  });

  const isLoading = isLoadingOrders || isLoadingInventory || isLoadingQuality;

  const summary = useMemo(() => {
    const today = new Date();
    const overdueOrders = orders.filter(
      (order) => new Date(order.dueDate) < today && order.status !== "出荷済み" && order.status !== "完了",
    );
    const lowStockItems = inventoryItems.filter((item) => item.stock <= item.minStock);
    const openQuality = qualityIssues.filter((issue) => issue.status !== "完了");
    const inProgress = orders.filter((order) => ["部品調達", "組立中", "検査待ち"].includes(order.status)).length;
    const averageProgress = orders.length > 0 ? Math.round(orders.reduce((sum, order) => sum + order.progress, 0) / orders.length) : 0;
    return {
      totalOrders: orders.length,
      inProgress,
      overdueOrders: overdueOrders.length,
      lowStockCount: lowStockItems.length,
      openQuality: openQuality.length,
      averageProgress,
    };
  }, [orders, inventoryItems, qualityIssues]);

  const orderStatusDistribution = useMemo(
    () => {
      const counts = {
        "設計中": 0,
        "部品調達": 0,
        "組立中": 0,
        "検査待ち": 0,
        "出荷済み": 0,
        "完了": 0,
      };
      orders.forEach((order) => {
        counts[order.status] += 1;
      });
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
    },
    [orders],
  );

  const lowStockItems = useMemo(() => inventoryItems.filter((item) => item.stock <= item.minStock), [inventoryItems]);
  const upcomingOrders = useMemo(
    () => [...orders].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).slice(0, 5),
    [orders],
  );

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>生産指示</CardTitle>
            <CardDescription>現在の案件数</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold">{summary.totalOrders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>進行中</CardTitle>
            <CardDescription>部品調達・組立・検査待ち</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold">{summary.inProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>在庫アラート</CardTitle>
            <CardDescription>最小在庫以下の部品</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold">{summary.lowStockCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>品質課題</CardTitle>
            <CardDescription>未解決の不具合件数</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold">{summary.openQuality}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>生産ステータス内訳</CardTitle>
            <CardDescription>ステータス別の案件数</CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={orderStatusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label />
                {orderStatusDistribution.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>平均完成率</CardTitle>
            <CardDescription>全生産指示の進捗平均</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-5xl font-semibold">{summary.averageProgress}%</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>納期が近い生産指示</CardTitle>
            <CardDescription>直近5件の納期予定</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingOrders.map((order) => (
                <div key={order.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{order.orderNumber} / {order.productName}</p>
                      <p className="text-sm text-muted-foreground">{order.customer} ・ {order.line}</p>
                    </div>
                    <p className="text-sm font-semibold">納期 {order.dueDate}</p>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <span>数量 {order.quantity}</span>
                    <span>進捗 {order.progress}%</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{order.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>在庫アラート</CardTitle>
            <CardDescription>最小在庫以下の部品</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lowStockItems.length > 0 ? (
                lowStockItems.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3">
                    <p className="font-semibold">{item.partNumber} / {item.partName}</p>
                    <p className="text-sm text-muted-foreground">在庫 {item.stock} / 最小 {item.minStock}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">在庫アラートはありません</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>品質課題一覧</CardTitle>
            <CardDescription>未解決の品質課題</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {qualityIssues.length === 0 ? (
                <p className="text-sm text-muted-foreground">未解決の課題はありません。</p>
              ) : (
                qualityIssues.map((issue) => (
                  <div key={issue.id} className="rounded-lg border p-4">
                    <p className="font-semibold">{issue.title}</p>
                    <p className="text-sm text-muted-foreground">{issue.category} / {issue.severity} / {issue.status}</p>
                    <p className="mt-2 text-sm">{issue.description}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>生産ステータス推移</CardTitle>
            <CardDescription>ステータス別件数</CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={orderStatusDistribution} margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
