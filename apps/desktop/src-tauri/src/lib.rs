// Desktop shell for Dust Runner '87. The game itself is the web build; this only opens a window.
// Phase 5 adds Steamworks (achievements, leaderboards, cloud saves) here.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Dust Runner '87");
}
