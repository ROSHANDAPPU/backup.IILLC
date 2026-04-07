import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import fs from 'fs';

// Read Env to bootstrap Supabase client
const envText = fs.readFileSync('.env', 'utf-8');
const supabaseUrlMatch = envText.match(/VITE_SUPABASE_URL=(.*)/);
const supabaseKeyMatch = envText.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabaseUrl = supabaseUrlMatch[1].trim();
const supabaseKey = supabaseKeyMatch[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
    console.log("--- 1. SETTING UP BACKEND STATE AS ADMIN ---");
    // 1. Log in Admin to bypass RLS
    const { data: adminAuth, error: authErr } = await supabase.auth.signInWithPassword({
        email: 'roshan.dxxi@gmail.com',
        password: 'Dxxi@R21'
    });
    if (authErr) throw new Error("Admin login failed: " + authErr.message);

    console.log("Admin logged in. Fetching Photographer profile...");

    // Find photographer profile user_id
    const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('email', 'Hilasmic2127@gmail.com');

    if (profErr || !profiles.length) throw new Error("Photographer profile not found.");
    const photographerId = profiles[0].user_id;

    // Assign Photographer Role if missing
    await supabase.from('user_roles').upsert({
        user_id: photographerId,
        role: 'photographer'
    }, { onConflict: 'user_id' });
    console.log("Photographer role enforced.");

    // Get any venue
    const { data: venues } = await supabase.from('venues').select('id').limit(1);
    const venueId = venues[0].id;

    // Insert an Active Shift
    const { data: shift, error: shiftErr } = await supabase.from('shifts').insert({
        photographer_id: photographerId,
        venue_id: venueId,
        status: 'active',
        start_time: new Date().toISOString(),
        total_sales: 0
    }).select().single();

    if (shiftErr) throw new Error("Failed to assign shift: " + shiftErr.message);
    console.log(`Assigned Active Shift internally: ${shift.id}`);

    // Sign out admin
    await supabase.auth.signOut();


    console.log("\n--- 2. LAUNCHING PLAYWRIGHT BROWSER ---");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("Navigating to app...");
    await page.goto('http://127.0.0.1:8080/app');

    console.log("Logging in as Photographer...");
    await page.fill('input[type="email"]', 'Hilasmic2127@gmail.com');
    await page.fill('input[type="password"]', 'Dxxi@R21');
    await page.click('button:has-text("Login")');
    await page.waitForTimeout(3000);

    // If prompted to start shift blind inventory, skip it by just jumping to Wallet
    console.log("Jumping to Wallet tab...");
    const walletTab = await page.$('text="Wallet"');
    if (walletTab) {
        await walletTab.click();
    }
    await page.waitForTimeout(2000);

    console.log("\n--- 3. GOING OFFLINE ---");
    await context.setOffline(true);
    console.log("Network throttling: OFFLINE");

    console.log("\n--- 4. TAPPING ADD SALE 3 TIMES ---");
    for (let i = 0; i < 3; i++) {
        try {
            await page.click('button:has-text("Add Cash Sale")');
            await page.waitForTimeout(300);
        } catch (e) {
            console.log("Add Cash Sale button missing/blocked. Might still be on start shift screen.");
            const beginBtn = await page.$('button:text-matches("Begin Shift", "i")');
            if (beginBtn) {
                console.log("Resolving blind start...");
                const inputs = await page.$$('input[type="number"]');
                for (const input of inputs) await input.fill("10");
                await beginBtn.click();
                await page.waitForTimeout(2000);
                await page.click('text="Wallet"');
                await page.waitForTimeout(1000);
                await page.click('button:has-text("Add Cash Sale")');
            }
        }
    }

    console.log("\n--- 5. CHECKING LOCAL STORAGE QUEUE ---");
    const queueData = await page.evaluate(() => localStorage.getItem("aaliyah_offline_queue"));
    console.log("aaliyah_offline_queue content:");
    console.log(queueData ? JSON.stringify(JSON.parse(queueData), null, 2) : "EMPTY");

    console.log("\n--- 6. GOING BACK ONLINE (Testing Drain) ---");
    await context.setOffline(false);
    console.log("Network throttling: ONLINE. Waiting 5 seconds for background array drain...");
    await page.waitForTimeout(5000);

    const postDrainData = await page.evaluate(() => localStorage.getItem("aaliyah_offline_queue"));
    console.log("Queue heavily drained? Remaining queue: ", postDrainData);

    // Sign out of playwright
    await browser.close();

    console.log("\n--- 7. VERIFYING DB SUPABASE INCREMENT ---");
    // Log back in as admin to verify shift total_sales
    await supabase.auth.signInWithPassword({ email: 'roshan.dxxi@gmail.com', password: 'Dxxi@R21' });
    const { data: finalShift } = await supabase
        .from('shifts')
        .select('id, total_sales')
        .eq('id', shift.id)
        .single();

    console.log(`Final DB shift ${finalShift.id} -> total_sales: ${finalShift.total_sales}`);

    if (finalShift.total_sales >= 3) {
        console.log("SUCCESS! RPC Increment worked atomically during sync drain!");
    } else {
        console.log("FAILURE! Total sales did not increment to 3.");
    }

    process.exit(0);
})();
