/// 壁纸磨砂窗效开关：liquid-glass（Codex）风格激活时由前端调用。
/// Windows 用 acrylic（tint 随明暗模式：浅色淡青绿 / 深色近黑），macOS 用 vibrancy
/// （UnderWindowBackground，材质随系统明暗自适应，忽略 dark）。
/// 禁用时 clear_* 真正清除；启用前先 clear 保证幂等（apply_vibrancy 每次调用会叠加新视图）。
/// 不支持的平台返回 Err，前端 catch 后保持回退底色（不设 data-window-effect）。
#[tauri::command]
pub fn set_window_effect(window: tauri::Window, enabled: bool, dark: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::{apply_acrylic, clear_acrylic};
        if enabled {
            clear_acrylic(&window).map_err(|e| e.to_string())?;
            let tint = if dark { (18, 22, 27, 160) } else { (226, 240, 232, 160) };
            apply_acrylic(&window, Some(tint)).map_err(|e| e.to_string())
        } else {
            clear_acrylic(&window).map_err(|e| e.to_string())
        }
    }
    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, clear_vibrancy, NSVisualEffectMaterial};
        clear_vibrancy(&window).map_err(|e| e.to_string())?;
        let result = if enabled {
            apply_vibrancy(&window, NSVisualEffectMaterial::UnderWindowBackground, None, None)
                .map_err(|e| e.to_string())
        } else {
            Ok(())
        };
        let _ = dark;
        result
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (&window, enabled, dark);
        Err("window effects are not supported on this platform".to_string())
    }
}
