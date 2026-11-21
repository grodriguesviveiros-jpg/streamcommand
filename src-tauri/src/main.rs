#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! STREAM COMMAND Desktop.
//!
//! A janela carrega o próprio site (a URL configurada em
//! `STREAM_COMMAND_APP_URL`) dentro de um webview. Como o webview não é uma
//! página HTTPS, o OBS WebSocket local (`ws://`) funciona: a conexão é feita
//! pelo processo nativo (ver `obs.rs`) e a interface a usa pelos comandos do
//! Tauri. Todo o resto — login, Twitch, chat, SSE — continua igual ao site.

mod obs;

use tauri::{WebviewUrl, WebviewWindowBuilder};

/// URL padrão usada quando nenhuma foi configurada no build.
const DEFAULT_APP_URL: &str = "http://localhost:3000";

fn app_url() -> String {
    std::env::var("STREAM_COMMAND_APP_URL")
        .ok()
        .or_else(|| option_env!("STREAM_COMMAND_APP_URL").map(str::to_string))
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_APP_URL.to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(obs::ObsState::default())
        .invoke_handler(tauri::generate_handler![
            obs::obs_connect,
            obs::obs_request,
            obs::obs_disconnect
        ])
        .setup(|app| {
            let url = app_url();
            let parsed = url
                .parse()
                .map_err(|error| format!("STREAM_COMMAND_APP_URL inválida ({url}): {error}"))?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(parsed))
                .title("STREAM COMMAND")
                .inner_size(1280.0, 860.0)
                .min_inner_size(960.0, 640.0)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o STREAM COMMAND Desktop");
}
