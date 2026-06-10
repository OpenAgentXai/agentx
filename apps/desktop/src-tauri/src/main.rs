// AgentX desktop shell — wraps the AgentX web app in a native window.
// The URL is configurable at build time via the AGENTX_APP_URL env var
// (defaults to the hosted instance in tauri.conf.json).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running AgentX desktop");
}
