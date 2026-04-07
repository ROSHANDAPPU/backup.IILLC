import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { ChatWidget } from "@/components/ChatWidget";
import { SyncEngine } from "@/lib/syncEngine";
import { useAuth } from "@/contexts/AuthContext";
import { calculatePay, projectSales, isWithinGeofence } from "@/lib/payEngine";
import { Camera, Clock, MapPin, Package, CheckCircle, ChevronRight, AlertTriangle, Star, Upload, Wallet, LayoutDashboard, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Venue {
  id: string;
  name: string;
  is_business_trip: boolean;
}

interface Shift {
  id: string;
  venue_id: string;
  start_time?: string;
  total_sales?: number;
  helper_ratio?: number;
  hourly_pay?: number;
  commission_rate?: number;
  final_pay?: number;
  hours_worked?: number;
  is_business_trip?: boolean;
  status?: string;
  venues?: { name: string, geofence_radius_meters?: number, latitude?: number, longitude?: number };
}

interface PayCalcResult {
  commissionRate: number;
  commissionPay: number;
  hourlyPay: number;
  finalPay: number;
  overageTip: number;
  payMethod: string;
  isBonusTier: boolean;
}

type ShiftStep = "idle" | "starting" | "blind_start" | "active" | "end_report" | "deposit" | "summary";

const PhotographerApp = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<ShiftStep>("idle");
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<string>("");
  const [assignedShift, setAssignedShift] = useState<Shift | null>(null);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [checkInDue, setCheckInDue] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkInSales, setCheckInSales] = useState("");
  const [consecutiveDismissals, setConsecutiveDismissals] = useState(0);

  // Navigation
  const [activeTab, setActiveTab] = useState<"dashboard" | "wallet" | "chat">("dashboard");

  // Inventory form state
  const [invForm, setInvForm] = useState({
    total_frames: "", broken_frames: "0", total_paper_sets: "",
    broken_paper_sets: "0", dnp_prints_remaining: "",
  });
  const [endForm, setEndForm] = useState({
    total_frames: "", broken_frames: "0", total_paper_sets: "",
    broken_paper_sets: "0", dnp_prints_remaining: "", total_sales: "",
  });

  // Pay summary
  const [payResult, setPayResult] = useState<PayCalcResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [closedShifts, setClosedShifts] = useState<Shift[]>([]);

  // Check for existing assigned or active shift
  useEffect(() => {
    if (!user) return;

    // Fetch Active Shift
    supabase
      .from("shifts")
      .select("*, venues(*)")
      .eq("photographer_id", user.id)
      .in("status", ["pending", "active", "held"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (data && !error) {
          setAssignedShift(data as Shift);
          if (data.status === "active" || data.status === "held") {
            setActiveShift(data as Shift);
            setStep("active");
          }
        }
      });

    // Fetch Completed Shifts for Wallet
    const fetchWallet = () => {
      supabase
        .from("shifts")
        .select("*, venues(*)")
        .eq("photographer_id", user.id)
        .eq("status", "closed")
        .order("end_time", { ascending: false })
        .limit(10)
        .then(({ data, error }) => {
          if (data && !error) {
            setClosedShifts(data as Shift[]);
          }
        });
    };

    fetchWallet();

    // Setup Realtime listener for Wallet updates
    const channel = supabase
      .channel(`photographer-shifts-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'shifts',
        filter: `photographer_id=eq.${user.id}`
      }, () => {
        fetchWallet();
      })
      .subscribe((status, err) => {
        console.log('photographer-shifts channel status:', status, err);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Timer for active shift
  useEffect(() => {
    if (step !== "active" || !activeShift?.start_time) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - new Date(activeShift.start_time).getTime()) / 1000);
      setElapsedSeconds(elapsed);
      // Check-in every 30 minutes
      if (elapsed > 0 && elapsed % 1800 < 2 && !showCheckIn) {
        setCheckInDue(true);
        setShowCheckIn(true);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [step, activeShift, showCheckIn]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  // ---- STEP: Start Shift ----
  const handleStartShift = async () => {
    if (!user || !assignedShift) return;
    setError("");
    setSubmitting(true);

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, enableHighAccuracy: true })
      );

      const userLat = pos.coords.latitude;
      const userLng = pos.coords.longitude;
      const venueLat = assignedShift.venues?.latitude;
      const venueLng = assignedShift.venues?.longitude;
      const radius = assignedShift.venues?.geofence_radius_meters || 200;

      // Strict Validation: If venue has GPS plotted, mathematically lock them out if they are not effectively there
      if (venueLat && venueLng) {
        const isInside = isWithinGeofence(userLat, userLng, Number(venueLat), Number(venueLng), radius);
        if (!isInside) {
          throw new Error(`Location Verification Failed: You are outside the ${radius}m venue perimeter.`);
        }
      }

      // Log physical presence coordinates to the DB along with activating the shift state
      const { error: updateErr } = await supabase.from("shifts").update({
        gps_lat: userLat,
        gps_lng: userLng,
        status: "active",
        start_time: new Date().toISOString()
      }).eq("id", assignedShift.id);

      if (updateErr) throw updateErr;

      setActiveShift({ ...assignedShift, status: "active", start_time: new Date().toISOString(), gps_lat: userLat, gps_lng: userLng } as Shift);
      setStep("blind_start");

    } catch (e: unknown) {
      const err = e as { code?: number; message?: string };
      if (err.code === 1) setError("GPS Permission Denied. You must allow location access to begin your shift.");
      else if (err.code === 2) setError("GPS Position Unavailable. Please ensure location services are active.");
      else if (err.code === 3) setError("GPS Timeout. Could not verify location.");
      else setError(err.message || "Failed to verify location requirements.");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- STEP: Blind Start Inventory ----
  const handleBlindStart = async () => {
    if (!activeShift || !user) return;
    setSubmitting(true);
    setError("");

    const totalF = parseInt(invForm.total_frames);
    const brokenF = parseInt(invForm.broken_frames);
    const totalP = parseInt(invForm.total_paper_sets);
    const brokenP = parseInt(invForm.broken_paper_sets);
    const dnp = parseInt(invForm.dnp_prints_remaining);

    // Initial front-end validation
    if (brokenF > totalF) {
      setError("Broken frames cannot be greater than total frames.");
      setSubmitting(false); return;
    }
    if (brokenP > totalP) {
      setError("Broken paper sets cannot be greater than total paper sets.");
      setSubmitting(false); return;
    }

    try {
      // 1. Fetch the most recent inventory_end for this venue
      const { data: previousInv } = await supabase
        .from("inventory_end")
        .select(`*, shifts!inner(venue_id)`)
        .eq("shifts.venue_id", activeShift.venue_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let hasDiscrepancy = false;
      let diffData = {};

      if (previousInv) {
        // Tolerances: frames=0, paper=0, dnp=2
        const frameDiff = Math.abs(previousInv.total_frames - totalF);
        const brokenFrameDiff = Math.abs(previousInv.broken_frames - brokenF);
        const paperDiff = Math.abs(previousInv.total_paper_sets - totalP);
        const brokenPaperDiff = Math.abs(previousInv.broken_paper_sets - brokenP);
        const dnpDiff = Math.abs(previousInv.dnp_prints_remaining - dnp);

        if (frameDiff > 0 || brokenFrameDiff > 0 || paperDiff > 0 || brokenPaperDiff > 0 || dnpDiff > 2) {
          hasDiscrepancy = true;
          // Build delta summary payload without showing previous values to photographer
          diffData = {
            previous_snapshot: previousInv,
            new_submission: { totalF, brokenF, totalP, brokenP, dnp }
          };
        }
      }

      // 2. Save submitted values to inventory_start
      const { error: invErr } = await supabase.from("inventory_start").insert({
        shift_id: activeShift.id,
        total_frames: totalF,
        broken_frames: brokenF,
        total_paper_sets: totalP,
        broken_paper_sets: brokenP,
        dnp_prints_remaining: dnp,
        has_discrepancy: hasDiscrepancy
      });

      if (invErr) throw invErr;

      // 3. Resolve shift state based on discrepancy
      if (hasDiscrepancy) {
        // Automatically create a discrepancy ticket
        await supabase.from("discrepancy_tickets").insert({
          venue_id: activeShift.venue_id,
          shift_id: activeShift.id,
          photographer_id: user.id,
          status: "open",
          delta_summary: diffData
        });

        // Set shift to held
        await supabase.from("shifts").update({
          status: "held",
          start_time: new Date().toISOString()
        }).eq("id", activeShift.id);

        setActiveShift({ ...activeShift, status: "held", start_time: new Date().toISOString() } as Shift);
        setStep("active");

        // Strictly EXACT requested message
        alert("Your inventory is under review. You may begin setting up your equipment.");
      } else {
        // Clean reconcile, activate shift
        await supabase.from("shifts").update({
          status: "active",
          start_time: new Date().toISOString()
        }).eq("id", activeShift.id);

        setActiveShift({ ...activeShift, status: "active", start_time: new Date().toISOString() } as Shift);
        setStep("active");
      }

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit blind start inventory");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- STEP: Quick Add Sale ----
  const handleAddSale = async (paymentType: 'cash' | 'online') => {
    if (!activeShift) return;
    setSubmitting(true);
    try {
      // Optimistic UI - count updates instantly locally!
      const newTotal = (activeShift.total_sales || 0) + 1;
      setActiveShift({ ...activeShift, total_sales: newTotal } as Shift);

      // Dump to Cache Engine
      SyncEngine.enqueue("increment_sales", { shift_id: activeShift.id, amount: 1 });
    } finally {
      setSubmitting(false);
    }
  };

  // ---- STEP: 30-min Check-in ----
  const handleCheckIn = async (dismissed: boolean) => {
    if (!activeShift) return;

    SyncEngine.enqueue("insert_log", {
      shift_id: activeShift.id,
      cumulative_sales: dismissed ? null : parseInt(checkInSales) || 0,
      was_dismissed: dismissed,
    });

    if (dismissed) {
      setConsecutiveDismissals((d) => d + 1);
    } else {
      setConsecutiveDismissals(0);
    }

    setShowCheckIn(false);
    setCheckInDue(false);
    setCheckInSales("");
  };

  // ---- STEP: End Shift ----
  const handleEndShift = async () => {
    if (!activeShift) return;
    setSubmitting(true);
    setError("");

    const totalSales = parseInt(endForm.total_sales);
    const startFrames = parseInt(invForm.total_frames) || 0;
    const endFrames = parseInt(endForm.total_frames);

    const { error: endErr } = await supabase.from("inventory_end").insert({
      shift_id: activeShift.id,
      total_frames: endFrames,
      broken_frames: parseInt(endForm.broken_frames),
      total_paper_sets: parseInt(endForm.total_paper_sets),
      broken_paper_sets: parseInt(endForm.broken_paper_sets),
      dnp_prints_remaining: parseInt(endForm.dnp_prints_remaining),
      total_sales: totalSales,
      frames_sold_calculated: startFrames - endFrames,
    });

    if (endErr) { setError(endErr.message); setSubmitting(false); return; }

    // Calculate pay
    const hoursWorked = elapsedSeconds / 3600;
    const pay = calculatePay({
      totalSales,
      hoursWorked,
      hourlyRate: activeShift.hourly_pay || (profile?.hourly_rate as number) || 15,
      helperRatio: activeShift.helper_ratio || 0,
      isBusinessTrip: activeShift.is_business_trip || false,
      commissionRateOverride: activeShift.commission_rate,
    });

    // Update shift
    const newEndTime = new Date().toISOString();
    await supabase.from("shifts").update({
      status: "closed" as const,
      end_time: newEndTime,
      hours_worked: Math.round(hoursWorked * 100) / 100,
      total_sales: totalSales,
      commission_rate: pay.commissionRate,
      commission_pay: pay.commissionPay,
      hourly_pay: pay.hourlyPay,
      final_pay: pay.finalPay,
      overage_tip: pay.overageTip,
    }).eq("id", activeShift.id);

    // Optimistically update closedShifts
    setClosedShifts((prev) =>
      [{
        ...activeShift,
        status: "closed",
        end_time: newEndTime,
        total_sales: totalSales,
        commission_rate: pay.commissionRate,
        commission_pay: pay.commissionPay,
        hourly_pay: pay.hourlyPay,
        final_pay: pay.finalPay,
        overage_tip: pay.overageTip,
      } as Shift, ...prev].slice(0, 10)
    );

    setPayResult(pay);
    setStep("deposit");
    setSubmitting(false);
  };

  // ---- STEP: Deposit Photo ----
  const handleDepositPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !activeShift) return;
    setSubmitting(true);

    const path = `${user.id}/${activeShift.id}-deposit.jpg`;
    const { error: upErr } = await supabase.storage.from("shift-photos").upload(path, file);
    if (upErr) { setError(upErr.message); setSubmitting(false); return; }

    const { data: urlData } = supabase.storage.from("shift-photos").getPublicUrl(path);

    await supabase.from("deposits").insert({
      shift_id: activeShift.id,
      photographer_id: user.id,
      image_url: urlData.publicUrl,
    });

    setStep("summary");
    setSubmitting(false);
  };

  // Projection data for active shift display
  const currentProjection = activeShift
    ? projectSales(activeShift.total_sales || 0, elapsedSeconds / 60, 300)
    : null;

  const projectedPayCalculation = activeShift && currentProjection ? calculatePay({
    totalSales: currentProjection.projectedTotal,
    hoursWorked: (elapsedSeconds / 3600) + currentProjection.remainingHours,
    hourlyRate: activeShift.hourly_pay || (profile?.hourly_rate as number) || 15,
    helperRatio: activeShift.helper_ratio || 0,
    isBusinessTrip: activeShift.is_business_trip || false,
    commissionRateOverride: activeShift.commission_rate,
  }) : null;

  // Render Dashboard Content
  const renderDashboard = () => (
    <AnimatePresence mode="wait">
      {/* IDLE - Select Venue & Start */}
      {step === "idle" && (
        <motion.div key="idle" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary mb-4">Shift Control</p>
          <h1 className="font-display italic text-3xl tracking-[-0.04em] leading-[0.9] mb-8">
            Ready to <span className="text-gradient-primary">shoot?</span>
          </h1>

          {assignedShift ? (
            <div className="glass-card rounded-xl p-8 max-w-sm mx-auto w-full mb-8 text-center">
              <MapPin size={32} className="text-primary mx-auto mb-4" />
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Assigned Tonight</p>
              <p className="font-mono text-xl text-foreground font-bold mb-8">
                {assignedShift.venues?.name || "Unknown Venue"}
              </p>

              {error && <p className="text-destructive text-xs font-mono mb-4">{error}</p>}

              <motion.button
                whileTap={{ scale: 0.98 }}
                disabled={submitting}
                onClick={handleStartShift}
                className="w-full glass-card py-4 rounded-lg font-mono text-[11px] uppercase tracking-[0.2em] text-primary hover:bg-primary/10 transition-all pulse-glow disabled:opacity-30 disabled:pulse-glow-none flex items-center justify-center gap-3"
              >
                <MapPin size={16} />
                {submitting ? "Verifying GPS..." : "Tap to begin"}
              </motion.button>
            </div>
          ) : (
            <div className="glass-card rounded-xl p-8 max-w-sm mx-auto w-full mb-8 text-center text-muted-foreground">
              <MapPin size={32} className="mx-auto mb-4 opacity-50" />
              <p className="font-mono text-sm">No shift assigned for tonight.</p>
              <p className="font-mono text-[10px] mt-2">Contact your Manager.</p>
            </div>
          )}
        </motion.div>
      )}

      {/* BLIND START - Inventory Count */}
      {step === "blind_start" && (
        <motion.div
          key="blind"
          className="fixed inset-0 z-[9999] bg-background overflow-y-auto px-6 pt-24 pb-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="max-w-sm mx-auto w-full">
            <div className="flex items-center gap-3 mb-2">
              <Package size={20} className="text-primary" />
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">Blind Start Inventory</p>
            </div>
            <h2 className="font-display italic text-2xl mb-2">Count everything.</h2>
            <p className="text-muted-foreground text-xs mb-8 leading-relaxed">
              Enter your physical count. Do not reference any previous numbers. No back button exists on this screen.
            </p>

            <div className="space-y-5">
              {[
                { key: "total_frames", label: "Total Frames in Case" },
                { key: "broken_frames", label: "Broken/Damaged Frames" },
                { key: "total_paper_sets", label: "Total Paper Sets" },
                { key: "broken_paper_sets", label: "Broken Paper Sets" },
                { key: "dnp_prints_remaining", label: "DNP Prints Remaining" },
              ].map((field) => (
                <div key={field.key}>
                  <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{field.label}</label>
                  <input
                    type="number"
                    required
                    value={invForm[field.key as keyof typeof invForm]}
                    onChange={(e) => setInvForm({ ...invForm, [field.key]: e.target.value })}
                    className={inputClass}
                    placeholder="0"
                    min="0"
                  />
                </div>
              ))}
            </div>

            {error && <p className="text-destructive text-xs font-mono mt-4">{error}</p>}

            <motion.button
              whileTap={{ scale: 0.98 }}
              disabled={submitting || !invForm.total_frames || !invForm.total_paper_sets || !invForm.dnp_prints_remaining}
              onClick={handleBlindStart}
              className="w-full glass-card py-4 rounded-lg font-mono text-[11px] uppercase tracking-[0.2em] text-primary hover:bg-primary/10 transition-all mt-8 pulse-glow disabled:opacity-30"
            >
              {submitting ? "Submitting..." : "Submit & Begin Shift"}
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* ACTIVE SHIFT */}
      {step === "active" && (
        <motion.div key="active" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
          <div className="text-center mb-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary mb-2">Shift Active</p>
            <p className="font-mono text-4xl text-foreground glow-text tabular-nums">{formatTime(elapsedSeconds)}</p>
            <p className="font-mono text-[10px] text-muted-foreground mt-2">
              {venues.find((v) => v.id === activeShift?.venue_id)?.name || "—"}
            </p>
          </div>

          {/* Quick Add Sales Terminal */}
          <div className="flex flex-col items-center justify-center py-6 mb-6 glass-card rounded-2xl border-t-4 border-primary">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">Direct Sales</p>
            <p className="font-mono text-6xl text-primary glow-text drop-shadow-[0_0_15px_rgba(212,175,55,0.4)] mb-8">
              {activeShift?.total_sales || 0}
            </p>

            <div className="grid grid-cols-2 gap-4 w-full px-6">
              <button
                onClick={() => handleAddSale('online')}
                disabled={submitting}
                className="glass-card py-4 rounded-xl flex flex-col items-center gap-2 hover:bg-primary/10 transition-all border border-blue-500/20 group active:scale-95 text-muted-foreground hover:text-blue-500"
              >
                <span className="text-2xl group-hover:scale-110 transition-transform">💳</span>
                <span className="font-mono text-[9px] uppercase tracking-widest transition-colors">Digital</span>
              </button>
              <button
                onClick={() => handleAddSale('cash')}
                disabled={submitting}
                className="glass-card py-4 rounded-xl flex flex-col items-center gap-2 hover:bg-primary/10 transition-all border border-green-500/20 group active:scale-95 text-muted-foreground hover:text-green-500"
              >
                <span className="text-2xl group-hover:scale-110 transition-transform">💵</span>
                <span className="font-mono text-[9px] uppercase tracking-widest transition-colors">Cash</span>
              </button>
            </div>
          </div>

          {/* Bonus Progress (hidden if helper locked) */}
          {activeShift?.helper_ratio < 50 && (
            <div className="glass-card rounded-xl p-5 mb-6">
              <div className="flex justify-between items-center mb-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Bonus Progress</p>
                <p className="font-mono text-[10px] text-primary">40 frames</p>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, ((activeShift?.total_sales || 0) / 40) * 100)}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <p className="font-mono text-[10px] text-muted-foreground mt-2">
                {activeShift?.total_sales || 0} / 40 frames
              </p>
            </div>
          )}

          {activeShift?.helper_ratio >= 50 && (
            <div className="glass-card rounded-xl p-5 mb-6 border-l-2 border-l-amber-500">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-500">
                Helper Active — Flat Rate Applied
              </p>
            </div>
          )}

          {/* End Shift Button */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setStep("end_report")}
            className="w-full glass-card py-4 rounded-lg font-mono text-[11px] uppercase tracking-[0.2em] text-destructive hover:bg-destructive/10 transition-all"
          >
            End Shift
          </motion.button>
        </motion.div>
      )}

      {/* CHECK-IN MODAL */}
      {showCheckIn && (
        <motion.div
          key="checkin-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-background/90 backdrop-blur-xl flex items-center justify-center px-6"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass-card rounded-2xl p-8 w-full max-w-sm text-center"
          >
            <Clock size={32} className="text-primary mx-auto mb-4" />
            <p className="font-display italic text-xl mb-2">30-Minute Check-In</p>
            <p className="text-muted-foreground text-xs mb-6">How many total frames sold so far?</p>
            <input
              type="number"
              value={checkInSales}
              onChange={(e) => setCheckInSales(e.target.value)}
              className={`${inputClass} text-center text-2xl font-bold mb-6`}
              placeholder="0"
              min="0"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => handleCheckIn(true)}
                className="flex-1 glass-card py-3 rounded-lg font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={() => handleCheckIn(false)}
                className="flex-1 glass-card py-3 rounded-lg font-mono text-[10px] uppercase tracking-[0.2em] text-primary hover:bg-primary/10 transition-all"
              >
                Submit
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* END REPORT */}
      {step === "end_report" && (
        <motion.div key="end" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
          <div className="flex items-center gap-3 mb-2">
            <Package size={20} className="text-primary" />
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">End Report</p>
          </div>
          <h2 className="font-display italic text-2xl mb-6">Final count.</h2>

          <div className="space-y-5">
            {[
              { key: "total_frames", label: "Total Frames Remaining" },
              { key: "broken_frames", label: "Broken/Damaged Frames" },
              { key: "total_paper_sets", label: "Total Paper Sets" },
              { key: "broken_paper_sets", label: "Broken Paper Sets" },
              { key: "dnp_prints_remaining", label: "DNP Prints Remaining" },
              { key: "total_sales", label: "Total Frames Sold" },
            ].map((field) => (
              <div key={field.key}>
                <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{field.label}</label>
                <input
                  type="number"
                  required
                  value={endForm[field.key as keyof typeof endForm]}
                  onChange={(e) => setEndForm({ ...endForm, [field.key]: e.target.value })}
                  className={`${inputClass} ${field.key === "total_sales" ? "text-lg font-bold text-primary" : ""}`}
                  placeholder="0"
                  min="0"
                />
              </div>
            ))}
          </div>

          {error && <p className="text-destructive text-xs font-mono mt-4">{error}</p>}

          <div className="flex gap-3 mt-8">
            <button onClick={() => setStep("active")} className="flex-1 glass-card py-4 rounded-lg font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Cancel
            </button>
            <motion.button
              whileTap={{ scale: 0.98 }}
              disabled={submitting || !endForm.total_frames || !endForm.total_sales}
              onClick={handleEndShift}
              className="flex-1 glass-card py-4 rounded-lg font-mono text-[11px] uppercase tracking-[0.2em] text-primary hover:bg-primary/10 transition-all pulse-glow disabled:opacity-30"
            >
              {submitting ? "Calculating..." : "Submit"}
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* DEPOSIT PHOTO */}
      {step === "deposit" && (
        <motion.div key="deposit" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="text-center">
          <Upload size={48} className="text-primary mx-auto mb-6" />
          <h2 className="font-display italic text-2xl mb-2">Photograph the deposit.</h2>
          <p className="text-muted-foreground text-xs mb-8">Take a photo of the cash envelope before closing your shift.</p>

          <label className="glass-card py-4 px-8 rounded-lg font-mono text-[11px] uppercase tracking-[0.2em] text-primary hover:bg-primary/10 transition-all cursor-pointer pulse-glow inline-flex items-center gap-3">
            <Camera size={16} />
            {submitting ? "Uploading..." : "Take Photo"}
            <input type="file" accept="image/*" capture="environment" onChange={handleDepositPhoto} className="hidden" />
          </label>
        </motion.div>
      )}

      {/* PAY SUMMARY */}
      {step === "summary" && payResult && (
        <motion.div key="summary" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
          <div className="text-center mb-8">
            <CheckCircle size={48} className="text-primary mx-auto mb-4" />
            <h2 className="font-display italic text-3xl mb-2">Shift Complete</h2>
            <p className="text-muted-foreground text-sm">Great work tonight.</p>
          </div>

          <div className="glass-card rounded-xl p-6 space-y-4 mb-8">
            <div className="flex justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Commission ({payResult.commissionRate}/frame)</span>
              <span className="font-mono text-sm">${payResult.commissionPay.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Hourly Floor</span>
              <span className="font-mono text-sm">${payResult.hourlyPay.toFixed(2)}</span>
            </div>
            <div className="anamorphic-line w-full" />
            <div className="flex justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary font-bold">Final Pay ({payResult.payMethod})</span>
              <span className="font-mono text-lg text-primary font-bold glow-text">${payResult.finalPay.toFixed(2)}</span>
            </div>
            {payResult.overageTip > 0 && (
              <div className="flex justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Overage Tip</span>
                <span className="font-mono text-sm text-green-400">+${payResult.overageTip.toFixed(2)}</span>
              </div>
            )}
            {payResult.isBonusTier && (
              <div className="flex items-center gap-2 mt-2">
                <Star size={14} className="text-primary fill-primary" />
                <span className="font-mono text-[10px] text-primary">Bonus tier achieved!</span>
              </div>
            )}
          </div>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => { setStep("idle"); setActiveShift(null); setPayResult(null); }}
            className="w-full glass-card py-4 rounded-lg font-mono text-[11px] uppercase tracking-[0.2em] text-primary hover:bg-primary/10 transition-all"
          >
            Done
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Render Wallet Content
  const renderWallet = () => (
    <motion.div key="wallet" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <div className="flex items-center gap-3 mb-8">
        <Wallet size={24} className="text-primary" />
        <h2 className="font-display italic text-3xl">Earnings</h2>
      </div>

      <div className="space-y-6">
        {activeShift && (
          <div className="glass-card p-6 rounded-2xl border-t-2 border-t-primary">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">Live Shift Projection</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-mono text-xs">Total Sales</span>
                <span className="font-mono text-xs text-primary">{activeShift.total_sales || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-xs">Elapsed Time</span>
                <span className="font-mono text-xs text-primary">{formatTime(elapsedSeconds)}</span>
              </div>
              <div className="anamorphic-line w-full my-4" />
              <div className="flex justify-between items-center">
                <span className="font-mono text-xs text-primary font-bold">Est. Payout</span>
                <span className="font-mono text-xl text-primary font-bold glow-text">
                  ${projectedPayCalculation?.finalPay.toFixed(2) || "0.00"}
                </span>
              </div>
            </div>
            {activeShift.helper_ratio >= 50 && (
              <div className="glass-card mt-4 p-4 rounded-xl border-l-2 border-l-amber-500 bg-amber-500/5">
                <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest leading-relaxed">Helper Ratio active. Pay is locked to hourly guarantee.</p>
              </div>
            )}
          </div>
        )}

        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-8 mb-4">Historical (Last 10)</h3>
        {closedShifts.length === 0 ? (
          <div className="glass-card p-8 rounded-2xl text-center border-dashed">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">No completed shifts yet.</p>
          </div>
        ) : (
          closedShifts.map(shift => (
            <div key={shift.id} className="glass-card p-5 rounded-xl border-l-2 border-l-muted-foreground">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-mono text-[10px] text-primary mb-1 uppercase tracking-widest">
                    {new Date(shift.start_time).toLocaleDateString()}
                  </p>
                  <p className="font-mono text-xs font-bold text-foreground">{shift.venues?.name || "Venue"}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm text-primary font-bold glow-text">${(shift.final_pay || 0).toFixed(2)}</p>
                  <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest">{shift.total_sales || 0} sales</p>
                </div>
              </div>
              <div className="flex gap-4">
                <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest">{shift.hours_worked || 0} hours</p>
                <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest">Base: ${(shift.hourly_pay || 0).toFixed(2)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );

  const inputClass = "w-full bg-transparent border-b border-muted focus:border-primary py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none transition-colors duration-500";

  return (
    <div className="min-h-screen pt-24 pb-32 px-6">
      <div className="max-w-md mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === "dashboard" && renderDashboard()}
          {activeTab === "wallet" && renderWallet()}
          {activeTab === "chat" && (
            <motion.div key="chat" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <div className="flex items-center gap-3 mb-8">
                <MessageSquare size={24} className="text-primary" />
                <h2 className="font-display italic text-3xl">Shift Chat</h2>
              </div>
              <div className="animate-fade-in mt-4">
                <ChatWidget viewScope="shift" shiftId={activeShift?.id} venueId={activeShift?.venue_id} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Mobile Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-safe bg-background/80 backdrop-blur-xl border-t border-border/50">
        <div className="container max-w-md mx-auto flex justify-between items-center px-4">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex flex-col items-center gap-1.5 p-2 transition-colors ${activeTab === "dashboard" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <LayoutDashboard size={20} className={activeTab === "dashboard" ? "glow-text" : ""} />
            <span className="font-mono text-[9px] uppercase tracking-wider">Dash</span>
          </button>
          <button
            onClick={() => setActiveTab("wallet")}
            className={`flex flex-col items-center gap-1.5 p-2 transition-colors ${activeTab === "wallet" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Wallet size={20} className={activeTab === "wallet" ? "glow-text" : ""} />
            <span className="font-mono text-[9px] uppercase tracking-wider">Wallet</span>
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex flex-col items-center gap-1.5 p-2 transition-colors ${activeTab === "chat" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <MessageSquare size={20} className={activeTab === "chat" ? "glow-text" : ""} />
            <span className="font-mono text-[9px] uppercase tracking-wider">Chat</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PhotographerApp;
