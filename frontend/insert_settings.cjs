const fs = require('fs');
const file = 'src/components/MerchantDashboard.jsx';
const lines = fs.readFileSync(file, 'utf8').split('\n');
const settingsContent = `      {tab === "settings" && (
        <div style={{ maxWidth: 520, padding: "0 4px" }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>Manage your business profile and notification preferences.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Business Name</label>
              <input value={settings.businessName} onChange={e => setSettings(s => ({ ...s, businessName: e.target.value }))} placeholder="Your business name" style={{ width: "100%", background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Email Address</label>
              <input value={settings.email} onChange={e => setSettings(s => ({ ...s, email: e.target.value }))} placeholder="your@email.com" type="email" style={{ width: "100%", background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)", fontSize: 13, boxSizing: "border-box" }} />
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Payment notifications will be sent to this address.</div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>Notification Preference</label>
              {[["email", "Email only", "Recommended. AuthOnce sends you an email for every payment event."], ["webhook", "Webhook only", "For developers. Your server receives instant POST notifications."], ["both", "Both email and webhook", "Receive email notifications and fire your webhook endpoint."]].map(([val, label, desc]) => (
                <div key={val} onClick={() => setSettings(s => ({ ...s, notifications: val }))} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: 8, border: \`0.5px solid \${settings.notifications === val ? "var(--green)" : "var(--border)"}\`, background: settings.notifications === val ? "rgba(52,211,153,0.06)" : "var(--bg-card)", cursor: "pointer", marginBottom: 8 }}>
                  <div style={{ width: 16, height: 16, borderRadius: "50%", border: \`2px solid \${settings.notifications === val ? "var(--green)" : "var(--border)"}\`, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0 }}>
                    {settings.notifications === val && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)" }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => { localStorage.setItem("merchant_settings_" + address, JSON.stringify(settings)); alert("Settings saved!"); }} style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", border: "none", borderRadius: 8, color: "#080c14", fontWeight: 700, fontSize: 13, padding: "10px 24px", cursor: "pointer", alignSelf: "flex-start" }}>Save Settings</button>
          </div>
        </div>
      )}`;
lines.splice(381, 0, settingsContent);
fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log('Done');
