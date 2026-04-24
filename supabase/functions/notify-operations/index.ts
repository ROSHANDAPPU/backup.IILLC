import "@supabase/functions-js/edge-runtime.d.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const ADMIN_EMAIL = 'aaliyahillusions@gmail.com'

interface NotificationPayload {
  type: 'discrepancy' | 'deposit_submitted' | 'deposit_confirmed' | 'shift_closed' | 'low_stock'
  record: Record<string, unknown>
  old_record?: Record<string, unknown>
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Aaliyah Illusions <onboarding@resend.dev>',
      to,
      subject,
      html
    })
  })
  return res.json()
}

Deno.serve(async (req) => {
  try {
    const payload: NotificationPayload = await req.json()
    const { type, record } = payload

    if (type === 'discrepancy') {
      await sendEmail(
        ADMIN_EMAIL,
        '🚨 Discrepancy Ticket Opened',
        `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #d97706;">⚠️ Discrepancy Alert</h2>
            <p>A new discrepancy ticket has been opened.</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Ticket ID</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${record.id}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Status</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${record.status}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Created</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${record.created_at}</td>
              </tr>
            </table>
            <p style="margin-top: 20px;">
              <a href="https://aaliyahillusions.com/manager" 
                 style="background: #d97706; color: white; padding: 10px 20px; 
                        text-decoration: none; border-radius: 6px;">
                Review in Dashboard
              </a>
            </p>
          </div>
        `
      )
    }

    if (type === 'deposit_submitted') {
      await sendEmail(
        ADMIN_EMAIL,
        '💰 New Deposit Submitted',
        `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #059669;">💰 Deposit Submitted</h2>
            <p>A photographer has submitted a deposit for review.</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Amount</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">$${record.amount}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Submitted</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${record.created_at}</td>
              </tr>
            </table>
            <p style="margin-top: 20px;">
              <a href="https://aaliyahillusions.com/manager" 
                 style="background: #059669; color: white; padding: 10px 20px; 
                        text-decoration: none; border-radius: 6px;">
                Confirm Deposit
              </a>
            </p>
          </div>
        `
      )
    }

    if (type === 'deposit_confirmed') {
      await sendEmail(
        ADMIN_EMAIL,
        '✅ Deposit Confirmed',
        `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">✅ Deposit Confirmed</h2>
            <p>A manager has confirmed a deposit of <strong>$${record.amount}</strong>.</p>
            <p>Confirmed at: ${record.confirmed_at}</p>
          </div>
        `
      )
    }

    if (type === 'shift_closed') {
      await sendEmail(
        ADMIN_EMAIL,
        '📊 Shift Closed — Nightly Summary',
        `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #7c3aed;">📊 Shift Closed</h2>
            <p>A shift has been completed and closed.</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Total Sales</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${record.total_sales}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Final Pay</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">$${record.final_pay}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Hours Worked</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${record.hours_worked}</td>
              </tr>
            </table>
          </div>
        `
      )
    }

    if (type === 'low_stock') {
      await sendEmail(
        ADMIN_EMAIL,
        '📦 Low Stock Alert',
        `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">📦 Low Stock Warning</h2>
            <p>A venue is running low on inventory.</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Venue</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${record.name}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Frames Remaining</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${record.frame_stock}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Paper Remaining</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${record.paper_stock}</td>
              </tr>
            </table>
          </div>
        `
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Notification error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})