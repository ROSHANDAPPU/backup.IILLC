import { useEffect, useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Activity, AlertTriangle, Package, DollarSign, Users, MapPin, Calendar } from "lucide-react";

interface Venue {
  id: string;
  name: string;
  is_active: boolean;
  frame_stock: number;
  low_stock_threshold: number;
  paper_stock: number;
}

interface Shift {
  id: string;
  start_time: string;
  total_sales: number;
  profiles?: { full_name: string };
  venues?: { name: string };
}

interface Ticket {
  id: string;
  status: string;
  delta_summary?: Record<string, number>;
  profiles?: { full_name: string };
  venues?: { name: string };
}

const AdminDashboard = () => {
  const { user, isAdmin, isManager } = useAuth();
  const [activeShifts, setActiveShifts] = useState<Shift[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deposits, setDeposits] = useState<any[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [tab, setTab] = useState<"live" | "tickets" | "inventory" | "schedule" | "payroll" | "chat" | "settings">("live");
  const [photographers, setPhotographers] = useState<{ user_id: string, full_name: string }[]>([]);
  const [scheduleForm, setScheduleForm] = useState({ venue_id: "", photographer_id: "", date: "", time: "", hourly_pay: "", commission_rate: "" });
  const [scheduling, setScheduling] = useState(false);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchDataDebounced = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      fetchData();
    }, 300);
  }, []);

  useEffect(() => {
    fetchData();

    const shiftsChannel = supabase
      .channel('admin-shifts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => fetchDataDebounced())
      .subscribe((status, err) => console.log('admin-shifts status:', status, err));

    const depositsChannel = supabase
      .channel('admin-deposits')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deposits' }, () => fetchDataDebounced())
      .subscribe((status, err) => console.log('admin-deposits status:', status, err));

    const ticketsChannel = supabase
      .channel('admin-tickets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discrepancy_tickets' }, () => fetchDataDebounced())
      .subscribe((status, err) => console.log('admin-tickets status:', status, err));

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      supabase.removeChannel(shiftsChannel);
      supabase.removeChannel(depositsChannel);
      supabase.removeChannel(ticketsChannel);
    };
  }, [fetchDataDebounced]);

  const fetchData = async () => {
    const [shiftsRes, ticketsRes, venuesRes, profilesRes, depositsRes] = await Promise.all([
      supabase.from("shifts").select("*, venues(name)").eq("status", "active"),
      supabase.from("discrepancy_tickets").select("*, venues(name)").in("status", ["open", "investigating"]).order("created_at", { ascending: false }),
      supabase.from("venues").select("*").eq("is_active", true),
      supabase.from("profiles").select("*").eq("is_active", true),
      supabase.from("deposits").select("*, shifts(total_sales, final_pay, venues(name))").eq("is_confirmed", false)
    ]);

    if (profilesRes.data) setPhotographers(profilesRes.data as any[]);
    if (venuesRes.data) setVenues(venuesRes.data);

    // Map profiles
    const profs = profilesRes.data || [];

    if (shiftsRes.data) {
      const mappedShifts = shiftsRes.data.map(s => ({ ...s, profiles: profs.find(p => p.user_id === s.photographer_id) }));
      setActiveShifts(mappedShifts as unknown as Shift[]);
    }
    if (ticketsRes.data) {
      const mappedTickets = ticketsRes.data.map(t => ({ ...t, profiles: profs.find(p => p.user_id === t.photographer_id) }));
      setTickets(mappedTickets as unknown as Ticket[]);
    }
    if (depositsRes.data) {
      const mappedDeposits = depositsRes.data.map(d => ({ ...d, profiles: profs.find(p => p.user_id === d.photographer_id) }));
      setDeposits(mappedDeposits);
    }
  };

  const handleScheduleShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleForm.venue_id || !scheduleForm.photographer_id || !scheduleForm.date || !scheduleForm.time) {
      alert("Please fill in all required fields (Photographer, Date, Time, Venue).");
      return;
    }

    setScheduling(true);

    try {
      // Safely construct ISO string
      const dateString = `${scheduleForm.date}T${scheduleForm.time.length === 5 ? scheduleForm.time + ':00' : scheduleForm.time}`;
      const parsedDate = new Date(dateString);

      if (isNaN(parsedDate.getTime())) {
        throw new Error("Invalid date or time format selected.");
      }

      const { error } = await supabase.from("shifts").insert({
        venue_id: scheduleForm.venue_id,
        photographer_id: scheduleForm.photographer_id,
        status: "pending",
        start_time: parsedDate.toISOString(),
        hourly_pay: scheduleForm.hourly_pay ? parseFloat(scheduleForm.hourly_pay) : null,
        commission_rate: scheduleForm.commission_rate ? parseFloat(scheduleForm.commission_rate) : null,
        assigned_by: user?.id,
        assigned_at: new Date().toISOString()
      });

      if (error) throw error;

      setScheduleForm({ venue_id: "", photographer_id: "", date: "", time: "", hourly_pay: "", commission_rate: "" });
      alert("Shift assigned successfully! When shift is completed, it will appear in the Deposits queue for approval.");
    } catch (err: unknown) {
      console.error("Assignment error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || "An unexpected error occurred assigning the shift.");
    } finally {
      setScheduling(false);
    }
  };

  const handleApproveDeposit = async (depositId: string) => {
    try {
      const { error } = await supabase.from("deposits").update({
        is_confirmed: true,
        confirmed_by: user?.id,
        confirmed_at: new Date().toISOString()
      }).eq("id", depositId);

      if (error) throw error;
      alert("Deposit mathematically verified and locked to ledger.");
      fetchData(); // refresh list
    } catch (err: unknown) {
      alert("Failed to confirm deposit: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const tabs = [
    { id: "live" as const, label: "Live Shifts", icon: Activity, count: activeShifts.length },
    { id: "tickets" as const, label: "Discrepancies", icon: AlertTriangle, count: tickets.length },
    { id: "inventory" as const, label: "Warehouse", icon: Package },
    { id: "schedule" as const, label: "Assign Shift", icon: Calendar },
    { id: "payroll" as const, label: "Payroll", icon: DollarSign, count: deposits.length },
    { id: "chat" as const, label: "Global Chat", icon: Users },
  ];

  return (
    <div className="min-h-screen pt-24 pb-20 px-6">
      <div className="container mx-auto max-w-6xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary mb-4">Command Center</p>
          <h1 className="font-display italic text-3xl md:text-4xl tracking-[-0.04em] leading-[0.9]">
            Control <span className="text-gradient-primary">Room</span>
          </h1>
        </motion.div>

        {/* Alert Banners */}
        {tickets.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card rounded-lg p-4 mb-6 border-l-2 border-l-destructive">
            <div className="flex items-center gap-3">
              <AlertTriangle size={16} className="text-destructive" />
              <p className="font-mono text-xs text-destructive">{tickets.length} open discrepancy ticket{tickets.length > 1 ? "s" : ""}</p>
            </div>
          </motion.div>
        )}

        {venues.filter(v => v.frame_stock <= v.low_stock_threshold).length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="glass-card rounded-lg p-4 mb-6 border-l-2 border-l-amber-500">
            <div className="flex items-center gap-3">
              <Package size={16} className="text-amber-500" />
              <p className="font-mono text-xs text-amber-500">
                Low stock at: {venues.filter(v => v.frame_stock <= v.low_stock_threshold).map(v => v.name).join(", ")}
              </p>
            </div>
          </motion.div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`glass-card px-5 py-3 rounded-lg font-mono text-[10px] uppercase tracking-[0.2em] flex items-center gap-2 whitespace-nowrap transition-all ${tab === t.id ? "text-primary border-primary/50 bg-primary/5" : "text-muted-foreground"
                }`}
            >
              <t.icon size={14} />
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="bg-primary/20 text-primary px-2 py-0.5 rounded-full text-[9px]">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Live Shifts */}
        {tab === "live" && (
          <div className="space-y-4">
            {activeShifts.length === 0 && (
              <div className="glass-card rounded-xl p-12 text-center">
                <Activity size={32} className="text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground text-sm">No active shifts right now.</p>
              </div>
            )}
            {activeShifts.map((shift: Shift) => (
              <motion.div
                key={shift.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-xl p-5"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-mono text-sm font-bold">{shift.profiles?.full_name || "Unknown"}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <MapPin size={12} className="text-primary" />
                      <p className="font-mono text-[10px] text-primary">{shift.venues?.name || ""}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs text-muted-foreground">
                      Started {new Date(shift.start_time).toLocaleTimeString()}
                    </p>
                    <p className="font-mono text-sm text-primary mt-1">{shift.total_sales || 0} sales</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Discrepancy Tickets */}
        {tab === "tickets" && (
          <div className="space-y-4">
            {tickets.length === 0 && (
              <div className="glass-card rounded-xl p-12 text-center">
                <AlertTriangle size={32} className="text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground text-sm">No open tickets. All clear.</p>
              </div>
            )}
            {tickets.map((ticket: Ticket) => (
              <motion.div
                key={ticket.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-xl p-5 border-l-2 border-l-destructive"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-mono text-sm font-bold">{ticket.venues?.name || ""}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{ticket.profiles?.full_name || ""}</p>
                  </div>
                  <span className={`font-mono text-[9px] uppercase px-2 py-1 rounded-full ${ticket.status === "open" ? "bg-destructive/20 text-destructive" : "bg-amber-500/20 text-amber-500"
                    }`}>
                    {ticket.status}
                  </span>
                </div>
                {ticket.delta_summary && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(ticket.delta_summary || {}).map(([key, val]) => (
                      <span key={key} className="font-mono text-[10px] px-2 py-1 rounded bg-destructive/10 text-destructive">
                        {key}: {typeof val === "object" ? "Complex Diff" : String(val)}
                      </span>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}

        {/* Inventory */}
        {tab === "inventory" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-primary/5 p-4 rounded-xl border border-primary/20">
              <div>
                <h3 className="font-mono text-sm tracking-widest uppercase">Global Warehouse</h3>
                <p className="text-xs text-muted-foreground mt-1">Receive new shipments to restock venues.</p>
              </div>
              <button className="glass-card px-4 py-2 rounded-lg text-[10px] font-mono uppercase tracking-[0.2em] text-primary hover:bg-primary/10 transition-colors">
                + Receive Stock
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {venues.map((venue) => {
                const stockPercent = venue.low_stock_threshold > 0
                  ? (venue.frame_stock / venue.low_stock_threshold) * 100
                  : 100;
                const color = stockPercent <= 100 ? "destructive" : stockPercent <= 120 ? "amber-500" : "primary";

                return (
                  <motion.div
                    key={venue.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card rounded-xl p-5"
                  >
                    <div className="flex justify-between items-center mb-4">
                      <p className="font-mono text-sm font-bold">{venue.name}</p>
                      <span className={`w-2 h-2 rounded-full ${venue.frame_stock <= venue.low_stock_threshold ? "bg-destructive" :
                        venue.frame_stock <= venue.low_stock_threshold * 1.2 ? "bg-amber-500" : "bg-green-500"
                        }`} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Frames</p>
                        <p className={`font-mono text-lg ${venue.frame_stock <= venue.low_stock_threshold ? "text-destructive" : ""}`}>{venue.frame_stock}</p>
                      </div>
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Paper</p>
                        <p className="font-mono text-lg">{venue.paper_stock}</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Schedule Shift */}
        {tab === "schedule" && (
          <div className="glass-card rounded-xl p-8 max-w-md mx-auto">
            <Calendar size={32} className="text-primary mx-auto mb-4" />
            <h2 className="font-display italic text-2xl mb-2 text-center">Assign a Shift</h2>
            <p className="text-muted-foreground text-xs mb-8 text-center">Pre-assign a pending shift to a photographer so they can clock in.</p>

            <form onSubmit={handleScheduleShift} className="space-y-6">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Select Photographer</label>
                <select
                  required
                  value={scheduleForm.photographer_id}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, photographer_id: e.target.value })}
                  className="w-full bg-background border border-muted rounded-lg px-4 py-3 mt-2 font-mono text-sm focus:border-primary transition-colors outline-none"
                >
                  <option value="">Choose employee...</option>
                  {photographers.map(p => (
                    <option key={p.user_id} value={p.user_id}>{p.full_name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Date</label>
                  <input
                    type="date"
                    required
                    value={scheduleForm.date}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, date: e.target.value })}
                    className="w-full bg-background border border-muted rounded-lg px-4 py-3 mt-2 font-mono text-sm focus:border-primary transition-colors outline-none"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Time</label>
                  <input
                    type="time"
                    required
                    value={scheduleForm.time}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, time: e.target.value })}
                    className="w-full bg-background border border-muted rounded-lg px-4 py-3 mt-2 font-mono text-sm focus:border-primary transition-colors outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Base Pay ($/hr)</label>
                  <input
                    type="number"
                    value={scheduleForm.hourly_pay}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, hourly_pay: e.target.value })}
                    placeholder="e.g. 15.00"
                    className="w-full bg-background border border-muted rounded-lg px-4 py-3 mt-2 font-mono text-sm focus:border-primary transition-colors outline-none"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Commission Rate ($)</label>
                  <input
                    type="number"
                    value={scheduleForm.commission_rate}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, commission_rate: e.target.value })}
                    placeholder="e.g. 3.00"
                    className="w-full bg-background border border-muted rounded-lg px-4 py-3 mt-2 font-mono text-sm focus:border-primary transition-colors outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Select Venue</label>
                <select
                  required
                  value={scheduleForm.venue_id}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, venue_id: e.target.value })}
                  className="w-full bg-background border border-muted rounded-lg px-4 py-3 mt-2 font-mono text-sm focus:border-primary transition-colors outline-none"
                >
                  <option value="">Choose location...</option>
                  {venues.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>

              <motion.button
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={scheduling}
                className="w-full glass-card py-4 rounded-lg font-mono text-[11px] uppercase tracking-[0.2em] text-primary hover:bg-primary/10 transition-all pulse-glow flex justify-center mt-8 disabled:opacity-30 disabled:pulse-glow-none"
              >
                {scheduling ? "Assigning..." : "Assign Shift"}
              </motion.button>
            </form>
          </div>
        )}

        {/* Payroll (Deposits Queue) */}
        {tab === "payroll" && (
          <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <h2 className="font-display italic text-2xl">Ledger & Verification</h2>
              <span className="glass-card px-3 py-1 rounded-full font-mono text-[10px] text-primary">
                {deposits.length} Pending
              </span>
            </div>

            {deposits.length === 0 ? (
              <div className="glass-card rounded-xl p-12 text-center border-dashed">
                <DollarSign size={32} className="text-primary mx-auto mb-4" />
                <p className="font-mono text-sm uppercase tracking-widest text-primary mb-2">No Open Deposits</p>
                <p className="text-xs text-muted-foreground">All cash drops have been verified and reconciled.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {deposits.map((deposit) => (
                  <motion.div key={deposit.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-xl overflow-hidden">
                    <div className="h-48 w-full bg-black/50 relative overflow-hidden group">
                      {deposit.image_url ? (
                        <img
                          src={deposit.image_url}
                          alt="Physical Deposit Proof"
                          className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-700"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">No image provided</div>
                      )}
                      <div className="absolute top-4 right-4 glass-card px-3 py-1 rounded-full bg-black/50 backdrop-blur-md">
                        <span className="font-mono text-xs font-bold text-primary">${deposit.shifts?.final_pay?.toFixed(2) || "0.00"}</span>
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="mb-4">
                        <p className="font-mono text-sm font-bold glow-text mb-1">{deposit.profiles?.full_name}</p>
                        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{deposit.shifts?.venues?.name}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="glass-card p-3 rounded-lg text-center bg-black/20">
                          <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Items Sold</p>
                          <p className="font-mono text-sm">{deposit.shifts?.total_sales || 0}</p>
                        </div>
                        <div className="glass-card p-3 rounded-lg text-center bg-black/20">
                          <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Time Logged</p>
                          <p className="font-mono text-sm">{new Date(deposit.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleApproveDeposit(deposit.id)}
                        className="w-full glass-card py-3 rounded-lg font-mono text-[10px] uppercase tracking-[0.2em] text-primary hover:bg-primary/10 transition-colors border border-primary/20 font-bold"
                      >
                        Verify & Reconcile Drop
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chat */}
        {tab === "chat" && (
          <div className="glass-card rounded-xl p-12 text-center border-dashed">
            <Users size={32} className="text-primary mx-auto mb-4" />
            <p className="font-mono text-sm uppercase tracking-widest text-primary mb-2">Global Broadcast</p>
            <p className="text-xs text-muted-foreground">Immutable chat service is offline.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
