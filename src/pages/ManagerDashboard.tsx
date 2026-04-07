import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, AlertCircle, Banknote, CheckCircle, Clock } from "lucide-react";

interface Venue { id: string; name: string; }
interface Ticket { id: string; status: string; venue_id: string; created_at: string; shift_id: string; }
interface Deposit { id: string; amount: number; is_confirmed: boolean; created_at: string; image_url: string; photographer: { full_name: string }; shift: { venue: { name: string } } }

const ManagerDashboard = () => {
    const { user, signOut } = useAuth();
    const [activeTab, setActiveTab] = useState<"overview" | "discrepancies" | "deposits">("overview");
    const [venues, setVenues] = useState<Venue[]>([]);
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [deposits, setDeposits] = useState<Deposit[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;

        const fetchDashboardData = async () => {
            // Because of our strict RLS policies, we can just query the tables directly!
            // Supabase will ONLY return rows belonging to this manager's assigned venues.

            const [venueRes, ticketRes, depositRes] = await Promise.all([
                supabase.from("venues").select("id, name"),
                supabase.from("discrepancy_tickets").select("*"),
                supabase.from("deposits").select(`
                  id, amount, is_confirmed, created_at, image_url,
                  photographer:photographer_id(full_name),
                  shift:shifts(venue:venue_id(name))
                `).order('created_at', { ascending: false })
            ]);

            if (venueRes.data) setVenues(venueRes.data);
            if (ticketRes.data) setTickets(ticketRes.data);
            if (depositRes.data) setDeposits(depositRes.data as unknown as Deposit[]);

            setLoading(false);
        };

        fetchDashboardData();
    }, [user]);

    const handleConfirmDeposit = async (id: string) => {
        await supabase.from("deposits").update({
            is_confirmed: true,
            confirmed_by: user?.id,
            confirmed_at: new Date().toISOString()
        }).eq("id", id);

        setDeposits(deps => deps.map(d => d.id === id ? { ...d, is_confirmed: true } : d));
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
                        { id: "discrepancies", label: `Discrepancies (${pendingTickets.length})`, icon: AlertCircle },
                        { id: "deposits", label: `Deposits (${pendingDeposits.length})`, icon: Banknote },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as "overview" | "discrepancies" | "deposits")}
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
                                            <button className="glass-card px-4 py-2 rounded text-xs font-mono uppercase tracking-widest text-primary hover:bg-primary/10 transition-colors shrink-0">
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
        </div>
    );
};

export default ManagerDashboard;
