import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, AlertCircle, Banknote, CheckCircle, Clock, Package, TrendingDown } from "lucide-react";

interface Venue { id: string; name: string; }
interface Ticket { id: string; status: string; venue_id: string; created_at: string; shift_id: string; }
interface Deposit { id: string; amount: number; is_confirmed: boolean; created_at: string; image_url: string; photographer: { full_name: string }; shift: { venue: { name: string } } }

interface VenueInventory {
    id: string;
    name: string;
    frame_stock: number;
    paper_stock: number;
    low_stock_threshold: number;
    active_shift?: {
        photographer: { full_name: string };
        status: string;
        total_sales: number;
    };
}

interface DiscrepancyTicket {
    id: string;
    status: string;
    venue_id: string;
    shift_id: string;
    created_at: string;
    notes?: string;
    shift?: {
        photographer: { full_name: string };
        venue: { name: string };
        total_sales: number;
    };
}

const ManagerDashboard = () => {
    const { user, signOut } = useAuth();
    const [activeTab, setActiveTab] = useState<"overview" | "inventory" | "discrepancies" | "deposits">("overview");
    const [venues, setVenues] = useState<Venue[]>([]);
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [deposits, setDeposits] = useState<Deposit[]>([]);
    const [loading, setLoading] = useState(true);
    const [inventory, setInventory] = useState<VenueInventory[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<DiscrepancyTicket | null>(null);
    const [investigateNotes, setInvestigateNotes] = useState("");
    const [resolving, setResolving] = useState(false);

    const fetchDashboardData = async () => {
        // Because of our strict RLS policies, we can just query the tables directly!
        // Supabase will ONLY return rows belonging to this manager's assigned venues.
        const [venueRes, ticketRes, depositRes, inventoryRes] = await Promise.all([
            supabase.from("venues").select("id, name"),
            supabase.from("discrepancy_tickets").select(`
                *,
                shift:shifts(
                    total_sales,
                    photographer:profiles!shifts_photographer_id_fkey(full_name),
                    venue:venues(name)
                )
            `),
            supabase.from("deposits").select(`
                id, amount, is_confirmed, created_at, image_url,
                photographer:photographer_id(full_name),
                shift:shifts(venue:venue_id(name))
            `).order('created_at', { ascending: false }),
            supabase.from("venues").select(`
                id, name, frame_stock, paper_stock, low_stock_threshold,
                active_shift:shifts(
                    status, total_sales,
                    photographer:profiles!shifts_photographer_id_fkey(full_name)
                )
            `).eq("shifts.status", "active")
        ]);

        if (venueRes.data) setVenues(venueRes.data);
        if (ticketRes.data) setTickets(ticketRes.data);
        if (depositRes.data) setDeposits(depositRes.data as unknown as Deposit[]);
        if (inventoryRes.data) setInventory(inventoryRes.data as unknown as VenueInventory[]);
        setLoading(false);
    };

    useEffect(() => {
        if (!user) return;
        fetchDashboardData();

        // REAL-TIME: Listen for new deposits
        const depositChannel = supabase
            .channel('manager_deposits')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'deposits' },
                () => { fetchDashboardData(); }
            )
            .subscribe();

        // REAL-TIME: Listen for new discrepancy tickets
        const ticketChannel = supabase
            .channel('manager_tickets')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'discrepancy_tickets' },
                () => { fetchDashboardData(); }
            )
            .subscribe();

        const inventoryChannel = supabase
            .channel('manager_inventory')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'venues' },
                () => { fetchDashboardData(); }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(depositChannel);
            supabase.removeChannel(ticketChannel);
            supabase.removeChannel(inventoryChannel);
        };
    }, [user]);

    const handleConfirmDeposit = async (id: string) => {
        await supabase.from("deposits").update({
            is_confirmed: true,
            confirmed_by: user?.id,
            confirmed_at: new Date().toISOString()
        }).eq("id", id);

        setDeposits(deps => deps.map(d => d.id === id ? { ...d, is_confirmed: true } : d));
    };

    const handleResolveTicket = async () => {
        if (!selectedTicket) return;
        setResolving(true);
        
        await supabase
            .from("discrepancy_tickets")
            .update({
                status: "resolved",
                notes: investigateNotes,
                resolved_by: user?.id,
                resolved_at: new Date().toISOString()
            })
            .eq("id", selectedTicket.id);

        // Update local state immediately
        setTickets(prev =>
            prev.map(t =>
                t.id === selectedTicket.id
                    ? { ...t, status: "resolved" }
                    : t
            )
        );

        setSelectedTicket(null);
        setInvestigateNotes("");
        setResolving(false);
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>;

    const pendingTickets = tickets.filter(t => t.status !== 'resolved');
    const pendingDeposits = deposits.filter(d => !d.is_confirmed);

    return (
        <div className="min-h-screen bg-background text-foreground pb-20">
            {/* Top Navigation */}
            <div className="glass-card sticky top-0 z-50 px-6 py-4 flex justify-between items-center rounded-none border-t-0 border-x-0">
                <div>
                    <h1 className="font-display italic text-2xl">Manager Portal</h1>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                        {venues.length} Assigned Venues
                    </p>
                </div>
                <button onClick={signOut} className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">
                    Sign Out
                </button>
            </div>

            <div className="container mx-auto max-w-5xl px-6 mt-8">
                {/* Desktop Tabs */}
                <div className="flex gap-4 mb-8 overflow-x-auto pb-2 scrollbar-none">
                    {[
                        { id: "overview", label: "Overview", icon: LayoutDashboard },
                        { id: "inventory", label: "Inventory", icon: Package },
                        { id: "discrepancies", label: `Discrepancies (${pendingTickets.length})`, icon: AlertCircle },
                        { id: "deposits", label: `Deposits (${pendingDeposits.length})`, icon: Banknote },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as "overview" | "inventory" | "discrepancies" | "deposits")}
                            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-mono text-[11px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id
                                ? "bg-primary/10 text-primary border border-primary/20 glow-box"
                                : "glass-card text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            <tab.icon size={16} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <AnimatePresence mode="wait">
                    {activeTab === "overview" && (
                        <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="glass-card p-6 rounded-2xl">
                                <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Venues Managed</h3>
                                <p className="text-4xl font-light text-foreground">{venues.length}</p>
                                <div className="mt-4 flex flex-col gap-2">
                                    {venues.map(v => <span key={v.id} className="font-mono text-xs text-muted-foreground">{v.name}</span>)}
                                </div>
                            </div>

                            <div className={`glass-card p-6 rounded-2xl border-l-2 ${pendingTickets.length > 0 ? "border-l-amber-500" : "border-l-green-500"}`}>
                                <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Action Required</h3>
                                <p className={`text-4xl font-light ${pendingTickets.length > 0 ? "text-amber-500 glow-text" : "text-green-500"}`}>
                                    {pendingTickets.length}
                                </p>
                                <p className="font-mono text-xs text-muted-foreground mt-2">Open Discrepancies</p>
                            </div>

                            <div className={`glass-card p-6 rounded-2xl border-l-2 ${pendingDeposits.length > 0 ? "border-l-primary" : "border-l-muted"}`}>
                                <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Pending Tills</h3>
                                <p className="text-4xl font-light text-primary">{pendingDeposits.length}</p>
                                <p className="font-mono text-xs text-muted-foreground mt-2">Unconfirmed Deposits</p>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === "inventory" && (
                        <motion.div
                            key="inv"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-4"
                        >
                            {inventory.length === 0 ? (
                                <div className="glass-card p-12 text-center rounded-2xl border-dashed">
                                    <Package size={32} className="mx-auto text-muted-foreground mb-4" />
                                    <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
                                        No Venue Data
                                    </p>
                                </div>
                            ) : (
                                inventory.map(venue => {
                                    const framesLow = venue.frame_stock <= venue.low_stock_threshold;
                                    const paperLow = venue.paper_stock <= venue.low_stock_threshold;
                                    const hasActiveShift = venue.active_shift && 
                                        Array.isArray(venue.active_shift) && 
                                        venue.active_shift.length > 0;
                                    const shift = hasActiveShift 
                                        ? (venue.active_shift as unknown as VenueInventory["active_shift"][])[0] 
                                        : null;

                                    return (
                                        <div
                                            key={venue.id}
                                            className={`glass-card p-6 rounded-2xl border-l-2 ${
                                                framesLow || paperLow
                                                    ? "border-l-amber-500"
                                                    : "border-l-green-500"
                                            }`}
                                        >
                                            {/* Venue Header */}
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <h3 className="font-display italic text-lg">
                                                        {venue.name}
                                                    </h3>
                                                    {shift ? (
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                                            <span className="font-mono text-[10px] uppercase tracking-widest text-green-500">
                                                                Live Shift
                                                            </span>
                                                            <span className="font-mono text-[10px] text-muted-foreground">
                                                                — {shift.photographer?.full_name}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <div className="w-2 h-2 rounded-full bg-muted" />
                                                            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                                                No Active Shift
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                                {shift && (
                                                    <div className="text-right">
                                                        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                                            Sales Tonight
                                                        </p>
                                                        <p className="font-mono text-2xl text-primary glow-text">
                                                            {shift.total_sales || 0}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Stock Bars */}
                                            <div className="space-y-3">
                                                {/* Frames */}
                                                <div>
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                                            Frames
                                                        </span>
                                                        <div className="flex items-center gap-2">
                                                            {framesLow && (
                                                                <TrendingDown size={12} className="text-amber-500" />
                                                            )}
                                                            <span className={`font-mono text-xs ${
                                                                framesLow ? "text-amber-500" : "text-foreground"
                                                            }`}>
                                                                {venue.frame_stock} remaining
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="w-full bg-muted/30 rounded-full h-2">
                                                        <div
                                                            className={`h-2 rounded-full transition-all ${
                                                                framesLow ? "bg-amber-500" : "bg-green-500"
                                                            }`}
                                                            style={{
                                                                width: `${Math.min(
                                                                    (venue.frame_stock / Math.max(venue.frame_stock + 50, 100)) * 100,
                                                                    100
                                                                )}%`
                                                            }}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Paper */}
                                                <div>
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                                            Paper Sets
                                                        </span>
                                                        <div className="flex items-center gap-2">
                                                            {paperLow && (
                                                                <TrendingDown size={12} className="text-amber-500" />
                                                            )}
                                                            <span className={`font-mono text-xs ${
                                                                paperLow ? "text-amber-500" : "text-foreground"
                                                            }`}>
                                                                {venue.paper_stock} remaining
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="w-full bg-muted/30 rounded-full h-2">
                                                        <div
                                                            className={`h-2 rounded-full transition-all ${
                                                                paperLow ? "bg-amber-500" : "bg-green-500"
                                                            }`}
                                                            style={{
                                                                width: `${Math.min(
                                                                    (venue.paper_stock / Math.max(venue.paper_stock + 50, 100)) * 100,
                                                                    100
                                                                )}%`
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Low stock warning */}
                                            {(framesLow || paperLow) && (
                                                <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                                    <TrendingDown size={14} className="text-amber-500 shrink-0" />
                                                    <p className="font-mono text-[10px] uppercase tracking-widest text-amber-500">
                                                        Low stock — restock before next shift
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </motion.div>
                    )}

                    {activeTab === "discrepancies" && (
                        <motion.div key="disc" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            {tickets.length === 0 ? (
                                <div className="glass-card p-12 text-center rounded-2xl border-dashed">
                                    <CheckCircle size={32} className="mx-auto text-green-500 mb-4" />
                                    <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground">All Clear</p>
                                    <p className="text-xs text-muted-foreground mt-2">No discrepancies detected at your venues.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {tickets.map(t => (
                                        <div key={t.id} className="glass-card p-6 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div>
                                                <div className="flex items-center gap-3 mb-2">
                                                    <AlertCircle size={16} className={t.status === 'open' ? 'text-amber-500' : 'text-green-500'} />
                                                    <span className="font-mono text-xs uppercase tracking-widest font-bold">Ticket #{t.id.slice(0, 6)}</span>
                                                    <span className={`px-2 py-0.5 rounded text-[9px] uppercase tracking-wider ${t.status === 'open' ? 'bg-amber-500/10 text-amber-500' : 'bg-green-500/10 text-green-500'}`}>{t.status}</span>
                                                </div>
                                                <p className="text-sm text-muted-foreground">Generated {new Date(t.created_at).toLocaleDateString()}</p>
                                            </div>
                                            <button
                                                onClick={() => setSelectedTicket(t as unknown as DiscrepancyTicket)}
                                                className="glass-card px-4 py-2 rounded text-xs font-mono uppercase tracking-widest text-primary hover:bg-primary/10 transition-colors shrink-0"
                                            >
                                                Investigate
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === "deposits" && (
                        <motion.div key="dep" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            {deposits.length === 0 ? (
                                <div className="glass-card p-12 text-center rounded-2xl border-dashed">
                                    <Banknote size={32} className="mx-auto text-muted-foreground mb-4" />
                                    <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground">No Deposits</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {deposits.map(d => (
                                        <div key={d.id} className="glass-card rounded-2xl overflow-hidden flex flex-col">
                                            <div className="h-48 bg-muted relative">
                                                <img src={d.image_url} alt="Deposit" className="w-full h-full object-cover" />
                                                {d.is_confirmed && (
                                                    <div className="absolute inset-0 bg-background/80 flex items-center justify-center backdrop-blur-sm">
                                                        <div className="text-center text-green-500">
                                                            <CheckCircle size={32} className="mx-auto mb-2" />
                                                            <span className="font-mono text-xs uppercase tracking-widest">Confirmed</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="p-5 flex-1 flex flex-col">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div>
                                                        <p className="font-mono text-xs text-muted-foreground mb-1">{d.photographer?.full_name}</p>
                                                        <p className="text-sm">{d.shift?.venue?.name}</p>
                                                    </div>
                                                    <p className="font-mono text-xl text-primary glow-text">${d.amount?.toFixed(2) || "0.00"}</p>
                                                </div>
                                                <div className="mt-auto pt-4">
                                                    {!d.is_confirmed ? (
                                                        <button
                                                            onClick={() => handleConfirmDeposit(d.id)}
                                                            className="w-full glass-card py-3 rounded-lg font-mono text-[10px] uppercase tracking-[0.2em] text-primary hover:bg-primary/10 transition-colors border-primary/20 pulse-glow"
                                                        >
                                                            Confirm Till
                                                        </button>
                                                    ) : (
                                                        <p className="font-mono text-[10px] text-center text-muted-foreground uppercase tracking-widest">Verified</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* INVESTIGATE MODAL */}
            {selectedTicket && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background/80 backdrop-blur-md">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="glass-card rounded-2xl w-full max-w-md p-8"
                    >
                        {/* Header */}
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                                    Discrepancy Investigation
                                </p>
                                <h2 className="font-display italic text-xl">
                                    Ticket #{selectedTicket.id.slice(0, 6)}
                                </h2>
                            </div>
                            <button
                                onClick={() => {
                                    setSelectedTicket(null);
                                    setInvestigateNotes("");
                                }}
                                className="text-muted-foreground hover:text-foreground transition-colors font-mono text-xs"
                            >
                                ✕ Close
                            </button>
                        </div>

                        {/* Ticket Details */}
                        <div className="glass-card rounded-xl p-4 mb-6 space-y-3 bg-black/20">
                            <div className="flex justify-between">
                                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                    Photographer
                                </span>
                                <span className="font-mono text-xs text-foreground">
                                    {selectedTicket.shift?.photographer?.full_name || "Unknown"}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                    Venue
                                </span>
                                <span className="font-mono text-xs text-foreground">
                                    {selectedTicket.shift?.venue?.name || "Unknown"}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                    Recorded Sales
                                </span>
                                <span className="font-mono text-xs text-primary glow-text">
                                    {selectedTicket.shift?.total_sales ?? "—"}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                    Status
                                </span>
                                <span className={`font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded ${
                                    selectedTicket.status === 'open'
                                        ? 'bg-amber-500/10 text-amber-500'
                                        : 'bg-green-500/10 text-green-500'
                                }`}>
                                    {selectedTicket.status}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                    Created
                                </span>
                                <span className="font-mono text-xs text-muted-foreground">
                                    {new Date(selectedTicket.created_at).toLocaleDateString()}
                                </span>
                            </div>
                        </div>

                        {/* Notes */}
                        {selectedTicket.status !== 'resolved' && (
                            <>
                                <div className="mb-4">
                                    <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-2">
                                        Investigation Notes
                                    </label>
                                    <textarea
                                        value={investigateNotes}
                                        onChange={(e) => setInvestigateNotes(e.target.value)}
                                        rows={3}
                                        placeholder="Describe what you found..."
                                        className="w-full bg-background border border-muted focus:border-primary rounded-lg px-4 py-3 font-mono text-sm resize-none transition-colors"
                                    />
                                </div>

                                <button
                                    onClick={handleResolveTicket}
                                    disabled={resolving || !investigateNotes.trim()}
                                    className="w-full glass-card py-4 rounded-lg font-mono text-[10px] uppercase tracking-[0.2em] text-green-500 hover:bg-green-500/10 transition-all border-green-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {resolving ? "Resolving..." : "Mark as Resolved"}
                                </button>
                            </>
                        )}

                        {selectedTicket.status === 'resolved' && (
                            <div className="text-center py-4">
                                <CheckCircle size={32} className="mx-auto text-green-500 mb-2" />
                                <p className="font-mono text-xs uppercase tracking-widest text-green-500">
                                    Already Resolved
                                </p>
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default ManagerDashboard;
