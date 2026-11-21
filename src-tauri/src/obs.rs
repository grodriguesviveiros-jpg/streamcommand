//! Cliente do WebSocket do OBS Studio (protocolo v5) no processo nativo.
//!
//! A interface do STREAM COMMAND roda dentro de um webview. Quando a página é
//! servida por HTTPS o navegador bloqueia conexões `ws://` (conteúdo misto),
//! então a conexão com o OBS é feita aqui, fora do webview, e exposta à
//! interface pelos comandos `obs_connect`, `obs_request` e `obs_disconnect`.
//! A senha nunca sai da máquina: o handshake e a autenticação acontecem aqui.

use std::time::Duration;

use base64::Engine as _;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::State;
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio::time::timeout;
use tokio_tungstenite::{connect_async, tungstenite::Message, MaybeTlsStream, WebSocketStream};

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

/// Tempo máximo de espera por cada passo do protocolo.
const STEP_TIMEOUT: Duration = Duration::from_secs(8);

/// Estado compartilhado da conexão com o OBS (uma por aplicativo).
#[derive(Default)]
pub struct ObsState {
    socket: Mutex<Option<Socket>>,
    counter: Mutex<u64>,
}

fn sha256_base64(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    base64::engine::general_purpose::STANDARD.encode(digest)
}

async fn next_message(socket: &mut Socket) -> Result<Value, String> {
    loop {
        let frame = timeout(STEP_TIMEOUT, socket.next())
            .await
            .map_err(|_| "O OBS não respondeu a tempo".to_string())?
            .ok_or_else(|| "A conexão com o OBS foi encerrada".to_string())?
            .map_err(|error| format!("Falha na conexão com o OBS: {error}"))?;
        match frame {
            Message::Text(text) => {
                return serde_json::from_str(&text)
                    .map_err(|error| format!("Resposta inválida do OBS: {error}"))
            }
            Message::Close(_) => return Err("A conexão com o OBS foi encerrada".to_string()),
            _ => continue,
        }
    }
}

/// Conecta no OBS e faz o handshake do protocolo v5 (Hello/Identify).
#[tauri::command]
pub async fn obs_connect(
    state: State<'_, ObsState>,
    host: String,
    port: u16,
    password: String,
) -> Result<(), String> {
    let url = format!("ws://{host}:{port}");
    let (mut socket, _) = timeout(STEP_TIMEOUT, connect_async(&url))
        .await
        .map_err(|_| {
            format!("Tempo esgotado ao conectar em {url}. O OBS está aberto e o WebSocket ativo?")
        })?
        .map_err(|error| {
            format!(
                "Não foi possível conectar em {url} ({error}). Abra o OBS e ative Ferramentas → WebSocket do OBS Server."
            )
        })?;

    let hello = next_message(&mut socket).await?;
    if hello["op"].as_i64() != Some(0) {
        return Err("O OBS não enviou a saudação do protocolo v5".to_string());
    }

    let mut identify = json!({ "rpcVersion": 1, "eventSubscriptions": 0 });
    if let Some(authentication) = hello["d"]["authentication"].as_object() {
        let challenge = authentication
            .get("challenge")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let salt = authentication
            .get("salt")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if password.is_empty() {
            return Err(
                "O OBS exige senha. Informe a senha configurada no WebSocket do OBS.".to_string(),
            );
        }
        let secret = sha256_base64(&format!("{password}{salt}"));
        identify["authentication"] = json!(sha256_base64(&format!("{secret}{challenge}")));
    }

    socket
        .send(Message::Text(
            json!({ "op": 1, "d": identify }).to_string(),
        ))
        .await
        .map_err(|error| format!("Falha ao identificar no OBS: {error}"))?;

    loop {
        let message = next_message(&mut socket).await?;
        match message["op"].as_i64() {
            Some(2) => break,
            // Eventos podem chegar antes da confirmação; são ignorados.
            Some(5) => continue,
            _ => return Err("O OBS recusou a identificação (senha incorreta?)".to_string()),
        }
    }

    *state.socket.lock().await = Some(socket);
    Ok(())
}

/// Envia uma requisição (op 6) e devolve o `responseData` da resposta (op 7).
#[tauri::command]
pub async fn obs_request(
    state: State<'_, ObsState>,
    request_type: String,
    request_data: Option<Value>,
) -> Result<Value, String> {
    let mut guard = state.socket.lock().await;
    let socket = guard
        .as_mut()
        .ok_or_else(|| "OBS desconectado".to_string())?;

    let request_id = {
        let mut counter = state.counter.lock().await;
        *counter += 1;
        format!("req-{}", *counter)
    };

    let payload = json!({
        "op": 6,
        "d": {
            "requestType": &request_type,
            "requestId": &request_id,
            "requestData": request_data.unwrap_or_else(|| json!({})),
        }
    });
    socket
        .send(Message::Text(payload.to_string()))
        .await
        .map_err(|error| format!("Falha ao enviar {request_type} ao OBS: {error}"))?;

    loop {
        let message = next_message(socket).await?;
        if message["op"].as_i64() != Some(7) {
            continue;
        }
        if message["d"]["requestId"].as_str() != Some(request_id.as_str()) {
            continue;
        }
        let status = &message["d"]["requestStatus"];
        if status["result"].as_bool() == Some(false) {
            let comment = status["comment"]
                .as_str()
                .unwrap_or("OBS recusou a solicitação");
            return Err(comment.to_string());
        }
        return Ok(message["d"]["responseData"].clone());
    }
}

/// Encerra a conexão atual com o OBS.
#[tauri::command]
pub async fn obs_disconnect(state: State<'_, ObsState>) -> Result<(), String> {
    if let Some(mut socket) = state.socket.lock().await.take() {
        let _ = socket.close(None).await;
    }
    Ok(())
}
