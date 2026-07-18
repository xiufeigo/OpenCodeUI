/// 壁纸磨砂窗效开关：liquid-glass（Codex）风格激活时由前端调用。
/// Windows 用 acrylic（淡青绿 tint），macOS 用 vibrancy（UnderWindowBackground），
/// 其他平台 no-op。
#[tauri::command]
pub fn set_window_effect(window: tauri::Window, enabled: bool) {
    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::apply_acrylic;
        let _ = if enabled {
            apply_acrylic(&window, Some((226, 240, 232, 160)))
        } else {
            apply_acrylic(&window, None)
        };
    }
    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
        if enabled {
            let _ = apply_vibrancy(&window, NSVisualEffectMaterial::UnderWindowBackground, None, None);
        } else {
            let _ = apply_vibrancy(&window, NSVisualEffectMaterial::WindowBackground, None, None);
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (&window, enabled);
    }
}
