"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ShieldCheck,
  Zap,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Play,
  Pause,
  Copy,
  Check,
  Plus,
  Send,
  LogOut,
  Search,
  Filter,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface WebhookEndpointItem {
  id: string;
  name: string;
  url: string;
  status: "healthy" | "degraded" | "circuit_broken";
  failureCount: number;
  secret: string;
  events: string[];
}

interface DeliveryLogItem {
  id: string;
  event: string;
  endpoint: string;
  status: number;
  latency: number;
  retries: number;
  state: "success" | "retrying" | "dlq";
  time: string;
  payload?: Record<string, unknown>;
}

// Generate guaranteed collision-free IDs
const createUniqueId = (prefix: string) => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
};

const initialEndpoints: WebhookEndpointItem[] = [
  {
    id: "ep_init_1",
    name: "Billing Service",
    url: "https://api.payment.internal/v1/wh",
    status: "healthy",
    failureCount: 0,
    secret: "whsec_a8f94d12c8b8",
    events: ["order.completed", "payment.authorized"],
  },
  {
    id: "ep_init_2",
    name: "CRM Sync Hub",
    url: "https://crm.partner.io/incoming",
    status: "degraded",
    failureCount: 3,
    secret: "whsec_34e112dff6a1",
    events: ["customer.created", "user.signup"],
  },
  {
    id: "ep_init_3",
    name: "Analytics Ingestion",
    url: "https://telemetry.analytics.dev/hooks",
    status: "circuit_broken",
    failureCount: 5,
    secret: "whsec_99bc80911e2f",
    events: ["invoice.failed", "refund.processed"],
  },
];

const initialLogs: DeliveryLogItem[] = [
  {
    id: "del_init_1",
    event: "order.placed",
    endpoint: "Billing Service",
    status: 200,
    latency: 142,
    retries: 0,
    state: "success",
    time: "10s ago",
    payload: { id: "ord_9901", amount: 4900, currency: "usd" },
  },
  {
    id: "del_init_2",
    event: "user.signup",
    endpoint: "CRM Sync Hub",
    status: 504,
    latency: 8200,
    retries: 2,
    state: "retrying",
    time: "45s ago",
    payload: { userId: "usr_4021", email: "client@acme.com" },
  },
  {
    id: "del_init_3",
    event: "invoice.failed",
    endpoint: "Analytics Ingestion",
    status: 500,
    latency: 450,
    retries: 4,
    state: "dlq",
    time: "2m ago",
    payload: { invoiceId: "inv_1102", error: "insufficient_funds" },
  },
];

export default function HookPulseDashboard() {
  const { user, logout } = useAuth();

  const [endpoints, setEndpoints] =
    useState<WebhookEndpointItem[]>(initialEndpoints);
  const [logs, setLogs] = useState<DeliveryLogItem[]>(initialLogs);
  const [isLiveStreaming, setIsLiveStreaming] = useState(true);
  const [selectedLog, setSelectedLog] = useState<DeliveryLogItem | null>(null);
  const [activeTab, setActiveTab] = useState<"stream" | "endpoints" | "dlq">(
    "stream",
  );
  const [copiedSecret, setCopiedSecret] = useState<string | null>(null);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "success" | "retrying" | "dlq"
  >("all");

  // Endpoint Creation Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEndpointName, setNewEndpointName] = useState("");
  const [newEndpointUrl, setNewEndpointUrl] = useState("");
  const [newEndpointEvents, setNewEndpointEvents] = useState(
    "order.completed, payment.authorized",
  );

  // Manual Trigger Event
  const [triggerEventName, setTriggerEventName] = useState("order.completed");
  const [isTriggering, setIsTriggering] = useState(false);

  // Background Simulator Engine with unique collision-free ID generation
  useEffect(() => {
    if (!isLiveStreaming || endpoints.length === 0) return;

    const interval = setInterval(() => {
      const targetEp = endpoints[Math.floor(Math.random() * endpoints.length)];
      const chosenEvent =
        targetEp.events.length > 0
          ? targetEp.events[Math.floor(Math.random() * targetEp.events.length)]
          : "webhook.ping";

      const willFail =
        targetEp.status === "circuit_broken" || Math.random() < 0.22;
      const status = willFail ? (Math.random() > 0.5 ? 500 : 504) : 200;

      const newLog: DeliveryLogItem = {
        id: createUniqueId("del"),
        event: chosenEvent,
        endpoint: targetEp.name,
        status,
        latency: willFail
          ? Math.floor(1200 + Math.random() * 4000)
          : Math.floor(65 + Math.random() * 180),
        retries: willFail ? 1 : 0,
        state: willFail ? "retrying" : "success",
        time: "Just now",
        payload: {
          event: chosenEvent,
          timestamp: Date.now(),
          target: targetEp.url,
        },
      };

      setLogs((prev) => [newLog, ...prev.slice(0, 39)]);
    }, 3200);

    return () => clearInterval(interval);
  }, [isLiveStreaming, endpoints]);

  // Derived telemetry metrics
  const telemetry = useMemo(() => {
    if (logs.length === 0)
      return { successRate: "100.0%", p95: 0, p99: 0, dlqCount: 0 };

    const successes = logs.filter((l) => l.state === "success").length;
    const rate = ((successes / logs.length) * 100).toFixed(1);

    const sortedLatencies = [...logs.map((l) => l.latency)].sort(
      (a, b) => a - b,
    );
    const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
    const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;
    const dlqCount = logs.filter((l) => l.state === "dlq").length;

    return { successRate: `${rate}%`, p95, p99, dlqCount };
  }, [logs]);

  // Filtered deliveries
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch =
        log.event.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.endpoint.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter =
        statusFilter === "all" || log.state === statusFilter;
      return matchesSearch && matchesFilter;
    });
  }, [logs, searchQuery, statusFilter]);

  const handleCopySecret = useCallback((secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedSecret(secret);
    setTimeout(() => setCopiedSecret(null), 2000);
  }, []);

  const handleRetry = useCallback((id: string) => {
    setLogs((prev) =>
      prev.map((log) =>
        log.id === id ? { ...log, state: "retrying", status: 202 } : log,
      ),
    );
  }, []);

  const handleCreateEndpoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEndpointName.trim() || !newEndpointUrl.trim()) return;

    const newEndpoint: WebhookEndpointItem = {
      id: createUniqueId("ep"),
      name: newEndpointName.trim(),
      url: newEndpointUrl.trim(),
      status: "healthy",
      failureCount: 0,
      secret: `whsec_${Math.random().toString(16).substring(2, 14)}`,
      events: newEndpointEvents
        .split(",")
        .map((ev) => ev.trim())
        .filter(Boolean),
    };

    setEndpoints((prev) => [...prev, newEndpoint]);
    setNewEndpointName("");
    setNewEndpointUrl("");
    setIsAddModalOpen(false);
  };

  const handleManualDispatch = () => {
    if (endpoints.length === 0) return;
    setIsTriggering(true);

    setTimeout(() => {
      const targetEp = endpoints[0];
      const newLog: DeliveryLogItem = {
        id: createUniqueId("del"),
        event: triggerEventName || "event.dispatched",
        endpoint: targetEp.name,
        status: 200,
        latency: 84,
        retries: 0,
        state: "success",
        time: "Just now",
        payload: {
          event: triggerEventName,
          dispatchedManually: true,
          timestamp: Date.now(),
        },
      };

      setLogs((prev) => [newLog, ...prev.slice(0, 39)]);
      setIsTriggering(false);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur px-8 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Zap size={20} />
          </div>
          <div>
            <h1 className="font-semibold text-base tracking-tight flex items-center gap-2">
              HookPulse{" "}
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                v1.0 Live
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Distributed Webhook Engine & Reliability Gateway
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {user.email}
            </div>
          )}

          <button
            onClick={() => setIsLiveStreaming(!isLiveStreaming)}
            className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
              isLiveStreaming
                ? "bg-emerald-950/40 text-emerald-400 border-emerald-800/60"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
          >
            {isLiveStreaming ? (
              <>
                <Pause size={14} /> Stream Active
              </>
            ) : (
              <>
                <Play size={14} /> Stream Paused
              </>
            )}
          </button>

          {user && (
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-rose-950/30 hover:text-rose-400 hover:border-rose-900/50 text-slate-400 transition"
              title="Sign Out"
            >
              <LogOut size={13} />
              <span>Logout</span>
            </button>
          )}
        </div>
      </header>

      <main className="p-8 max-w-7xl mx-auto w-full space-y-6 flex-1">
        {/* Telemetry Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Success Rate
            </span>
            <div className="text-2xl font-bold text-slate-100 mt-1">
              {telemetry.successRate}
            </div>
            <span className="text-xs text-emerald-400 flex items-center gap-1 mt-1">
              <ShieldCheck size={13} /> Live Stream SLA
            </span>
          </div>

          <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              P95 Latency
            </span>
            <div className="text-2xl font-bold text-slate-100 mt-1">
              {telemetry.p95} ms
            </div>
            <span className="text-xs text-slate-400 mt-1 block">
              95th percentile window
            </span>
          </div>

          <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              P99 Latency
            </span>
            <div className="text-2xl font-bold text-slate-100 mt-1">
              {telemetry.p99} ms
            </div>
            <span className="text-xs text-slate-400 mt-1 block">
              Outlier upper bound
            </span>
          </div>

          <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              DLQ Quarantined
            </span>
            <div className="text-2xl font-bold text-rose-400 mt-1">
              {telemetry.dlqCount}
            </div>
            <span className="text-xs text-rose-400/80 mt-1 block">
              Awaiting manual replay
            </span>
          </div>
        </div>

        {/* Action Header / Quick Trigger bar */}
        <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Test Ingestion:
            </div>
            <input
              type="text"
              value={triggerEventName}
              onChange={(e) => setTriggerEventName(e.target.value)}
              placeholder="e.g. payment.completed"
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500/60"
            />
            <button
              onClick={handleManualDispatch}
              disabled={isTriggering}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition disabled:opacity-50"
            >
              <Send size={12} className={isTriggering ? "animate-spin" : ""} />
              {isTriggering ? "Dispatching..." : "Fire Webhook"}
            </button>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
          >
            <Plus size={14} /> Add Endpoint
          </button>
        </div>

        {/* View Switcher Tabs & Filters */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("stream")}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition ${
                activeTab === "stream"
                  ? "bg-slate-800 text-slate-100"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Live Delivery Stream ({logs.length})
            </button>
            <button
              onClick={() => setActiveTab("endpoints")}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition ${
                activeTab === "endpoints"
                  ? "bg-slate-800 text-slate-100"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Configured Endpoints ({endpoints.length})
            </button>
            <button
              onClick={() => setActiveTab("dlq")}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition ${
                activeTab === "dlq"
                  ? "bg-slate-800 text-slate-100"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Dead Letter Queue ({telemetry.dlqCount})
            </button>
          </div>

          {activeTab === "stream" && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-48">
                <Search
                  size={13}
                  className="absolute left-2.5 top-2.5 text-slate-500"
                />
                <input
                  type="text"
                  placeholder="Search deliveries..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-700"
                />
              </div>

              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs">
                <Filter size={12} className="text-slate-500 ml-1" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="bg-transparent text-slate-300 text-xs focus:outline-none pr-1 cursor-pointer"
                >
                  <option value="all">All</option>
                  <option value="success">Success</option>
                  <option value="retrying">Retrying</option>
                  <option value="dlq">DLQ</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* TAB 1: Live Stream */}
        {activeTab === "stream" && (
          <div className="border border-slate-800 bg-slate-900/40 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Event Topic</th>
                  <th className="py-3 px-4">Endpoint</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Latency</th>
                  <th className="py-3 px-4">Attempt</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-slate-800/30 transition cursor-pointer"
                  >
                    <td className="py-3 px-4 text-slate-200 font-semibold">
                      {log.event}
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-sans">
                      {log.endpoint}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-sans font-medium ${
                          log.status === 200
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : log.state === "dlq"
                              ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}
                      >
                        {log.status === 200 && <CheckCircle2 size={12} />}
                        {log.state === "dlq" && <XCircle size={12} />}
                        {log.state === "retrying" && (
                          <RefreshCw size={12} className="animate-spin" />
                        )}
                        {log.status}{" "}
                        {log.state === "retrying"
                          ? "Retrying"
                          : log.state === "dlq"
                            ? "Quarantined"
                            : "Delivered"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {log.latency}ms
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {log.retries + 1}/4
                    </td>
                    <td
                      className="py-3 px-4 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(log.state === "retrying" || log.state === "dlq") && (
                        <button
                          onClick={() => handleRetry(log.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-sans text-xs transition border border-slate-700"
                        >
                          <RefreshCw size={12} /> Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: Endpoints */}
        {activeTab === "endpoints" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {endpoints.map((ep) => (
              <div
                key={ep.id}
                className="border border-slate-800 bg-slate-900/40 p-5 rounded-xl space-y-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-slate-100">{ep.name}</h3>
                    <p className="text-xs font-mono text-slate-400 mt-0.5">
                      {ep.url}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${
                      ep.status === "healthy"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : ep.status === "circuit_broken"
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }`}
                  >
                    {ep.status.replace("_", " ")}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {ep.events.map((ev) => (
                    <span
                      key={ev}
                      className="px-2 py-0.5 bg-slate-800/80 border border-slate-700 text-slate-300 text-[10px] font-mono rounded"
                    >
                      {ev}
                    </span>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    Secret:{" "}
                    <span className="font-mono text-slate-300">
                      {ep.secret}
                    </span>
                  </span>
                  <button
                    onClick={() => handleCopySecret(ep.secret)}
                    className="text-slate-400 hover:text-slate-200"
                    title="Copy secret"
                  >
                    {copiedSecret === ep.secret ? (
                      <Check size={14} className="text-emerald-400" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: Dead Letter Queue */}
        {activeTab === "dlq" && (
          <div className="border border-slate-800 bg-slate-900/40 rounded-xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  Exhausted Deliveries (DLQ)
                </h3>
                <p className="text-xs text-slate-400">
                  Payloads that reached maximum retry attempts and require
                  intervention.
                </p>
              </div>
              <button
                onClick={() =>
                  setLogs(
                    logs.map((l) =>
                      l.state === "dlq" ? { ...l, state: "retrying" } : l,
                    ),
                  )
                }
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition"
              >
                Replay All Quarantined
              </button>
            </div>
            <div className="space-y-2">
              {logs
                .filter((l) => l.state === "dlq")
                .map((dlqItem) => (
                  <div
                    key={dlqItem.id}
                    className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg flex justify-between items-center text-xs"
                  >
                    <div className="space-y-1 font-mono">
                      <div className="text-slate-200 font-medium">
                        {dlqItem.event} - {dlqItem.endpoint}
                      </div>
                      <div className="text-rose-400 text-[11px]">
                        Last Error: HTTP {dlqItem.status} Destination timeout
                        after 4 retries
                      </div>
                    </div>
                    <button
                      onClick={() => handleRetry(dlqItem.id)}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition border border-slate-700"
                    >
                      Re-enqueue
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}
      </main>

      {/* Inspect Delivery Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                  Delivery Details{" "}
                  <span className="font-mono text-xs text-slate-400">
                    ({selectedLog.id})
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Destination: {selectedLog.endpoint}
                </p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 font-medium block mb-1">
                  Generated Signature (HMAC-SHA256):
                </span>
                <pre className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-emerald-400 font-mono text-[11px] overflow-x-auto">
                  t={Date.now()},v1=8f7e2a91c530b1e427d19...
                </pre>
              </div>

              <div>
                <span className="text-slate-400 font-medium block mb-1">
                  Payload Body (JSON):
                </span>
                <pre className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-300 font-mono text-[11px] overflow-x-auto">
                  {JSON.stringify(
                    selectedLog.payload || {
                      event: selectedLog.event,
                      data: { id: "ord_9901", amount: 4900, currency: "usd" },
                    },
                    null,
                    2,
                  )}
                </pre>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Endpoint */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateEndpoint}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-semibold text-slate-100">
                  Register Webhook Endpoint
                </h3>
                <p className="text-xs text-slate-400">
                  Target server that will receive signed payloads
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Friendly Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Stripe Sync Service"
                  value={newEndpointName}
                  onChange={(e) => setNewEndpointName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Destination URL
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://api.domain.com/webhooks"
                  value={newEndpointUrl}
                  onChange={(e) => setNewEndpointUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-slate-200 focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Subscribed Events (comma separated)
                </label>
                <input
                  type="text"
                  placeholder="order.completed, refund.issued"
                  value={newEndpointEvents}
                  onChange={(e) => setNewEndpointEvents(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-slate-200 focus:outline-none focus:border-emerald-500/60"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition"
              >
                Save Endpoint
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
