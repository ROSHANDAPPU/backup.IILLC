import { supabase } from "@/integrations/supabase/client";
import localforage from "localforage";

export type SyncAction = "increment_sales" | "insert_log" | "insert_message" | "update_shift";

export interface QueuedOperation {
    id: string; // unique offline uuid
    timestamp: number;
    type: SyncAction;
    payload: any;
    retryCount: number;
    failed: boolean;
}

const QUEUE_KEY = "aaliyah_offline_queue";

// Configure localforage
localforage.config({
    name: "AaliyahIllusions",
    storeName: "offline_sync_queue",
    description: "Offline operations queue"
});

export class SyncEngine {
    static async getQueue(): Promise<QueuedOperation[]> {
        try {
            const queue = await localforage.getItem<QueuedOperation[]>(QUEUE_KEY);
            return queue || [];
        } catch (err) {
            console.error("LocalForage getQueue error:", err);
            return [];
        }
    }

    static async saveQueue(queue: QueuedOperation[]): Promise<void> {
        try {
            await localforage.setItem(QUEUE_KEY, queue);
            window.dispatchEvent(new Event("sync_queue_updated"));
        } catch (err) {
            console.error("LocalForage saveQueue error:", err);
        }
    }

    static async enqueue(type: SyncAction, payload: any): Promise<void> {
        const queue = await this.getQueue();
        queue.push({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            type,
            payload,
            retryCount: 0,
            failed: false
        });
        await this.saveQueue(queue);

        // Attempt immediate drain if online
        if (navigator.onLine) {
            this.drainQueue();
        }
    }

    static async drainQueue(): Promise<void> {
        if (!navigator.onLine) return;

        let queue = await this.getQueue();
        // Only attempt items that haven't permanently failed
        let activeItems = queue.filter(item => !item.failed);

        if (activeItems.length === 0) return;

        let queueChanged = false;

        for (const item of activeItems) {
            if (!navigator.onLine) break; // Network dropped mid-drain

            try {
                await this.executeOperation(item);
                // Exclude the completed item
                queue = queue.filter(q => q.id !== item.id);
                queueChanged = true;
            } catch (err) {
                console.error("Sync Engine Drain Error:", err);

                // Update the specific item in the queue array
                const qIndex = queue.findIndex(q => q.id === item.id);
                if (qIndex > -1) {
                    queue[qIndex].retryCount += 1;

                    if (queue[qIndex].retryCount >= 3) {
                        queue[qIndex].failed = true; // Permanently flagged for manual UI retry
                    } else {
                        // Exponential backoff sleep (approx 1s, 2s) before looping next items
                        await new Promise(r => setTimeout(r, Math.random() * 1000 * queue[qIndex].retryCount));
                    }
                    queueChanged = true;
                }
            }
        }

        if (queueChanged) {
            await this.saveQueue(queue);
        }
    }

    static async executeOperation(item: QueuedOperation): Promise<void> {
        if (item.type === "increment_sales") {
            const { error } = await supabase.rpc('increment_shift_sales', {
                target_shift_id: item.payload.shift_id,
                amount: item.payload.amount || 1
            });
            if (error) throw error;
        }
        else if (item.type === "insert_log") {
            const { error } = await supabase.from("interval_logs").insert(item.payload);
            if (error) throw error;
        }
        else if (item.type === "insert_message") {
            const { error } = await supabase.from("messages").insert(item.payload);
            if (error) throw error;
        }
        else if (item.type === "update_shift") {
            const { error } = await supabase
                .from("shifts")
                .update(item.payload.data)
                .eq("id", item.payload.shift_id);
            if (error) throw error;
        }
    }

    static async wipeFailures(): Promise<void> {
        let queue = await this.getQueue();
        queue = queue.filter(item => !item.failed);
        await this.saveQueue(queue);
    }

    static async resetFailuresAndRetry(): Promise<void> {
        let queue = await this.getQueue();
        queue = queue.map(item => ({ ...item, failed: false, retryCount: 0 }));
        await this.saveQueue(queue);
        this.drainQueue();
    }
}

// Global auto-listen
if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
        SyncEngine.drainQueue();
    });
}
