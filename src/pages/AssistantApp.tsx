import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, MapPin, Package, CheckCircle, AlertTriangle, Clock, Camera } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Shift {
    id: string;
    venue_id: string;
    photographer_id: string;
    assistant_id: string;
    status: string;
    start_time: string;
    total_sales: number;
    assistant_clock_in?: string;
    assistant_clock_out?: string;
    venues: { name: string };
    photographer: { full_name: string };
}

const AssistantApp = () => {
    const { user, signOut } = useAuth();
    const [activeShift, setActiveShift] = useState<Shift | null>(null);
    const [loading, setLoading] = useState(true);
    const [step, setStep] = useState<"assign" | "live" | "inventory" | "evidence" | "issue">("assign");
    const [submitting, setSubmitting] = useState(false);
    const [elapsed, setElapsed] = useState(0);

    // States for verification
    const [inventoryForm, setInventoryForm] = useState({ frames: "", brokenFrames: "", paper: "", brokenPaper: "" });
    const [activeTab, setActiveTab] = useState<"stats" | "verify" | "issues">("stats");

    useEffect(() => {
        if (!user) return;
        const fetchAssignedShift = async () => {
            const { data, error } = await supabase
                .from('shifts')
                .select(`*, venues(name), photographer:profiles!shifts_photographer_id_fkey(full_name)`)
                .eq('assistant_id', user.id)
                .in('status', ['pending', 'active'])
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (data) {
                setActiveShift(data as unknown as Shift);
                if ((data as Record<string, unknown>).assistant_clock_in) {
                    setStep("live");
                }
            }
            setLoading(false);
        };
        fetchAssignedShift();
    }, [user]);

    // Realtime total_sales synchronization
    useEffect(() => {
        if (!activeShift) return;
        const channel = supabase.channel(`shift_${activeShift.id}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shifts', filter: `id=eq.${activeShift.id}` }, (payload) => {
                if (payload.new.total_sales !== undefined) {
                    setActiveShift(prev => prev ? { ...prev, total_sales: payload.new.total_sales } : null);
                }
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [activeShift?.id]);

    // Timer
    useEffect(() => {
        if (activeShift?.assistant_clock_in && !activeShift.assistant_clock_out) {
            const interval = setInterval(() => {
                setElapsed(Math.floor((Date.now() - new Date(activeShift.assistant_clock_in!).getTime()) / 1000));
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [activeShift]);

    const formatTime = (s: number) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
    };

    const handleJoinShift = async () => {
        if (!activeShift) return;
        setSubmitting(true);
        const timestamp = new Date().toISOString();

        // Attempt DB log, but UI won't break if migration hasn't specifically run yet
        try {
            // @ts-expect-error schema dynamically updated
            await supabase.from("shifts").update({ assistant_clock_in: timestamp }).eq("id", activeShift.id);

            // @ts-expect-error schema dynamically updated
            await supabase.from("assistant_logs").insert({
                shift_id: activeShift.id,
                assistant_id: user?.id,
                event_type: "clock_in"
            });
        } catch (e) { console.log("DB sync fallback:", e); }

        setActiveShift({ ...activeShift, assistant_clock_in: timestamp });
        setStep("live");
        setSubmitting(false);
    };

    const submitInventoryVerification = async () => {
        setSubmitting(true);
        try {
            // @ts-expect-error schema dynamically updated
            await supabase.from("assistant_logs").insert({
                shift_id: activeShift!.id,
                assistant_id: user?.id,
                event_type: "inventory_check",
                payload: {
                    frames: parseInt(inventoryForm.frames) || 0,
                    broken_frames: parseInt(inventoryForm.brokenFrames) || 0,
                }
            });
            alert("Inventory sync logged successfully!");
            setInventoryForm({ frames: "", brokenFrames: "", paper: "", brokenPaper: "" });
            setActiveTab("stats");
        } catch (err: unknown) { alert(err instanceof Error ? err.message : String(err)); }
        setSubmitting(false);
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>;

    return (
        <div className="min-h-screen bg-background text-foreground pb-24">
            <div className="glass-card sticky top-0 z-50 px-6 py-4 flex justify-between items-center rounded-none border-t-0 border-x-0">
                <div>
                    <h1 className="font-display italic text-2xl">Assistant</h1>
                </div>
                <button className="text-muted-foreground hover:text-primary transition-colors">
                    <MessageSquare size={20} />
                </button>
            </div>

            <div className="container mx-auto max-w-sm px-6 mt-8">

                {/* ASSIGNMENT SCREEN */}
                {step === "assign" && (
                    <div className="glass-card p-8 rounded-2xl text-center">
                        {activeShift ? (
                            <>
                                <MapPin size={32} className="text-primary mx-auto mb-4" />
                                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">Assigned Tonight</p>
                                <div className="space-y-2 mb-8 text-left glass-card p-4 rounded-lg bg-black/20">
                                    <p className="text-sm font-mono"><span className="text-muted-foreground">Venue:</span> <span className="text-primary glow-text">{activeShift.venues?.name || "Unknown"}</span></p>
                                    <p className="text-sm font-mono"><span className="text-muted-foreground">Lead:</span> {activeShift.photographer?.full_name}</p>
                                </div>
                                <button
                                    onClick={handleJoinShift}
                                    disabled={submitting}
                                    className="w-full glass-card py-5 rounded-lg font-mono text-xs uppercase tracking-[0.2em] text-primary hover:bg-primary/10 transition-all pulse-glow"
                                >
                                    {submitting ? "Joining..." : "Tap to Join Shift"}
                                </button>
                            </>
                        ) : (
                            <>
                                <Clock className="w-8 h-8 mx-auto text-muted-foreground mb-4" />
                                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">No Assignment</p>
                                <p className="text-sm mt-2 text-muted-foreground">You don't have an active assistant shift tonight.</p>
                            </>
                        )}

                        <button onClick={signOut} className="w-full mt-12 flex justify-center py-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-destructive transition-colors">
                            Sign Out
                        </button>
                    </div>
                )}

                {/* LIVE MODULE (TABS) */}
                {step === "live" && activeShift && (
                    <>
                        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-none">
                            <button onClick={() => setActiveTab('stats')} className={`px-4 py-2 rounded-full font-mono text-[10px] uppercase tracking-widest whitespace-nowrap transition-colors ${activeTab === 'stats' ? 'bg-primary text-background' : 'glass-card text-muted-foreground'}`}>Live Data</button>
                            <button onClick={() => setActiveTab('verify')} className={`px-4 py-2 rounded-full font-mono text-[10px] uppercase tracking-widest whitespace-nowrap transition-colors flex items-center gap-1 ${activeTab === 'verify' ? 'bg-primary text-background' : 'glass-card text-muted-foreground'}`}><CheckCircle size={10} /> Verify</button>
                            <button onClick={() => setActiveTab('issues')} className={`px-4 py-2 rounded-full font-mono text-[10px] uppercase tracking-widest whitespace-nowrap transition-colors flex items-center gap-1 ${activeTab === 'issues' ? 'bg-destructive text-destructive-foreground' : 'glass-card text-muted-foreground'}`}><AlertTriangle size={10} /> Issues</button>
                        </div>

                        <AnimatePresence mode="wait">
                            {activeTab === 'stats' && (
                                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                                    <div className="glass-card p-8 rounded-2xl mb-6 text-center border-t-4 border-t-primary">
                                        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Time Elapsed</p>
                                        <p className="text-3xl font-light mb-8 font-mono">{formatTime(elapsed)}</p>

                                        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Verified Direct Sales</p>
                                        <p className="text-5xl font-bold mt-2 text-primary glow-text drop-shadow-[0_0_15px_rgba(212,175,55,0.4)]">
                                            {activeShift.total_sales || 0}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-4 italic">Led by: {activeShift.photographer?.full_name}</p>
                                    </div>
                                </motion.div>
                            )}

                            {activeTab === 'verify' && (
                                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                                    <div className="glass-card p-6 rounded-2xl space-y-4">
                                        <div className="text-center mb-6">
                                            <Package size={24} className="text-primary mx-auto mb-2" />
                                            <h2 className="font-display italic text-lg">Cross-Check Inventory</h2>
                                            <p className="text-xs text-muted-foreground">Verify physical counts mid-shift</p>
                                        </div>

                                        <div>
                                            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Total Frames Remaining</label>
                                            <input type="number" required value={inventoryForm.frames} onChange={(e) => setInventoryForm({ ...inventoryForm, frames: e.target.value })} className="w-full bg-background border border-muted focus:border-primary rounded-lg px-4 py-3 mt-1 font-mono text-sm" placeholder="e.g. 50" />
                                        </div>
                                        <div>
                                            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Broken Frames Total</label>
                                            <input type="number" required value={inventoryForm.brokenFrames} onChange={(e) => setInventoryForm({ ...inventoryForm, brokenFrames: e.target.value })} className="w-full bg-background border border-muted focus:border-destructive rounded-lg px-4 py-3 mt-1 font-mono text-sm" placeholder="e.g. 2" />
                                        </div>

                                        <button onClick={submitInventoryVerification} disabled={submitting || !inventoryForm.frames} className="w-full glass-card py-4 mt-4 rounded-lg font-mono text-xs uppercase tracking-[0.2em] text-primary hover:bg-primary/10 transition-all flex justify-center items-center gap-2">
                                            {submitting ? "Logging..." : "Log Verification"}
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                            {activeTab === 'issues' && (
                                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                                    <div className="grid grid-cols-2 gap-4">
                                        <button className="glass-card p-4 rounded-xl text-center border-destructive/20 hover:bg-destructive/10 transition-colors group">
                                            <Camera className="mx-auto mb-2 text-muted-foreground group-hover:text-destructive" size={24} />
                                            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground group-hover:text-foreground">Equipment Issue</span>
                                        </button>
                                        <button className="glass-card p-4 rounded-xl text-center border-destructive/20 hover:bg-destructive/10 transition-colors group">
                                            <AlertTriangle className="mx-auto mb-2 text-muted-foreground group-hover:text-destructive" size={24} />
                                            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground group-hover:text-foreground">Lead Issue</span>
                                        </button>
                                        <button className="glass-card p-4 rounded-xl text-center border-amber-500/20 hover:bg-amber-500/10 transition-colors group col-span-2">
                                            <Package className="mx-auto mb-2 text-muted-foreground group-hover:text-amber-500" size={24} />
                                            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground group-hover:text-foreground">Force Discrepancy Ticket</span>
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </>
                )}
            </div>
        </div>
    );
};

export default AssistantApp;
