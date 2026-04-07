import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Send, Users, ShieldAlert, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Message {
    id: string;
    sender_id: string;
    shift_id?: string;
    venue_id?: string;
    recipient_scope: "individual" | "venue" | "all_photographers" | "all_staff";
    is_broadcast: boolean;
    content: string;
    created_at: string;
    profiles?: { full_name: string };
}

interface ChatWidgetProps {
    viewScope: "shift" | "venue" | "global";
    shiftId?: string;
    venueId?: string;
}

export const ChatWidget = ({ viewScope, shiftId, venueId }: ChatWidgetProps) => {
    const { user, profile } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [loading, setLoading] = useState(true);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!user) return;
        fetchMessages();

        // Subscribe to messages
        const channel = supabase
            .channel('chat-room')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                // Optimistically relying on RLS to filter what actually hits the client is technically safe, 
                // but since Realtime broadcasts everything matching the filter, we just refetch or append if valid.
                fetchMessages();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, shiftId, venueId, viewScope]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const fetchMessages = async () => {
        if (!user) return;
        try {
            let query = supabase
                .from("messages")
                .select("*, profiles(full_name)")
                .order("created_at", { ascending: true });

            // Dynamic filtering based on explicit scope boundary
            if (viewScope === "shift" && shiftId) {
                query = query.or(`shift_id.eq.${shiftId},is_broadcast.eq.true`);
            } else if (viewScope === "venue" && venueId) {
                query = query.or(`venue_id.eq.${venueId},is_broadcast.eq.true`);
            } else if (viewScope === "global") {
                query = query.limit(100);
            }

            const { data, error } = await query;
            if (error) throw error;
            setMessages((data || []) as unknown as Message[]);
        } catch (err) {
            console.error("Chat fetch error:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !user) return;

        const payload = {
            sender_id: user.id,
            content: newMessage.trim(),
            shift_id: viewScope === "shift" ? shiftId : null,
            venue_id: viewScope === "venue" ? venueId : null,
            is_broadcast: viewScope === "global",
            recipient_scope: viewScope === "global" ? "all_staff" : (viewScope === "venue" ? "venue" : "individual"),
        };

        setNewMessage("");

        try {
            const { error } = await supabase.from("messages").insert(payload);
            if (error) throw error;
        } catch (err: unknown) {
            alert("Failed to send message: " + (err as Error).message);
        }
    };

    return (
        <div className="flex flex-col h-[500px] glass-card rounded-2xl border-t-2 border-t-primary overflow-hidden">
            {/* Header */}
            <div className="p-4 bg-primary/5 border-b border-primary/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <MessageSquare size={18} className="text-primary" />
                    <div>
                        <h3 className="font-mono text-sm font-bold uppercase tracking-widest text-primary">
                            {viewScope === "global" ? "Global Command Auth" : viewScope === "venue" ? "Venue Dispatch" : "Shift Dispatch"}
                        </h3>
                        <p className="text-[9px] text-muted-foreground font-mono uppercase tracking-[0.2em] mt-1">
                            Immutable Log Active
                        </p>
                    </div>
                </div>
                {viewScope === "global" && <ShieldAlert size={16} className="text-destructive/50 hover:text-destructive transition-colors cursor-pointer" />}
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loading ? (
                    <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-xs uppercase tracking-widest animate-pulse">
                        Connecting Secure Channel...
                    </div>
                ) : messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                        <Users size={32} className="mb-4" />
                        <p className="font-mono text-xs uppercase tracking-widest">No Transmissions</p>
                        <p className="text-[10px] text-muted-foreground mt-2 max-w-[200px]">All communications are permanently recorded to ledger.</p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMe = msg.sender_id === user?.id;
                        return (
                            <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                                <div className="flex items-end gap-2 mb-1">
                                    {!isMe && <span className="font-mono text-[10px] text-muted-foreground">{msg.profiles?.full_name || "Unknown"}</span>}
                                    {msg.is_broadcast && !isMe && (
                                        <span className="font-mono text-[8px] bg-destructive/20 text-destructive px-1.5 py-0.5 rounded uppercase tracking-wider">
                                            Broadcast
                                        </span>
                                    )}
                                </div>
                                <div
                                    className={`px-4 py-3 rounded-2xl max-w-[85%] ${isMe
                                        ? "bg-primary text-primary-foreground rounded-tr-none shadow-[0_0_15px_rgba(212,175,55,0.2)]"
                                        : msg.is_broadcast
                                            ? "bg-destructive/10 border border-destructive/20 rounded-tl-none font-bold"
                                            : "glass-card rounded-tl-none"
                                        }`}
                                >
                                    <p className="text-sm leading-relaxed">{msg.content}</p>
                                </div>
                                <span className="font-mono text-[9px] text-muted-foreground mt-1 opacity-50">
                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSend} className="p-4 bg-background/50 border-t border-white/5 backdrop-blur-xl">
                <div className="relative">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder={viewScope === "global" ? "TRANSMIT GLOBAL DIRECTIVE..." : "Send message to dispatch..."}
                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-4 pr-12 py-4 font-mono text-sm focus:border-primary/50 transition-colors outline-none placeholder:opacity-40"
                    />
                    <button
                        type="submit"
                        disabled={!newMessage.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-30"
                    >
                        <Send size={16} />
                    </button>
                </div>
            </form>
        </div>
    );
};
