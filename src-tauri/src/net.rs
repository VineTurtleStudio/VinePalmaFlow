use crate::models::{DeviceInfo, PairSession, TrustedDevice};
use crate::Error;
use mdns_sd::{ResolvedService, ServiceDaemon, ServiceEvent, ServiceInfo};
use serde_json::json;
use std::collections::HashMap;
use std::net::{TcpListener, UdpSocket};
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::AppHandle;
use tauri::Emitter;
use uuid::Uuid;

pub const SERVICE_TYPE: &str = "_localflow._tcp.local.";
pub const ADVERTISED_PORT: u16 = 4485;
const PAIR_TIMEOUT: Duration = Duration::from_secs(15);
/// 应用启动后延迟触发首轮全量自动同步（等待 mDNS 解析结果填充）
const AUTO_SYNC_STARTUP_DELAY: Duration = Duration::from_secs(4);

/// 自动同步请求：与单台设备同步，或与全部在线受信设备同步
#[derive(Debug)]
pub enum AutoSyncRequest {
    Device(String),
    All,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DeviceIdentity {
    pub id: String,
    pub name: String,
    pub os: String,
}

pub struct NetState {
    pub daemon: Option<ServiceDaemon>,
    pub identity: DeviceIdentity,
    pub port: u16,
    pub discovered: Arc<Mutex<HashMap<String, DeviceInfo>>>,
    pub pair_sessions: Arc<Mutex<HashMap<String, PairSession>>>,
    pub app: AppHandle,
    /// 手动/自动同步互斥，避免并发双向同步互相覆盖
    pub sync_gate: Arc<Mutex<()>>,
    /// 自动同步请求通道（启动时全量 + 发现可信设备时单台）
    pub sync_trigger: mpsc::Sender<AutoSyncRequest>,
}

pub(crate) fn config_root() -> PathBuf {
    if let Ok(dir) = std::env::var("LOCALFLOW_CONFIG_DIR") {
        return PathBuf::from(dir);
    }
    dirs::config_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("vinepalmaflow")
}

fn identity_file() -> PathBuf {
    config_root().join("device.json")
}

fn trusted_file() -> PathBuf {
    config_root().join("devices.json")
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn local_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    Some(socket.local_addr().ok()?.ip().to_string())
}

fn ensure_identity() -> DeviceIdentity {
    let os = format!("{}/{}", std::env::consts::OS, std::env::consts::ARCH);
    if let Ok(content) = std::fs::read_to_string(identity_file()) {
        if let Ok(mut d) = serde_json::from_str::<DeviceIdentity>(&content) {
            d.os = os;
            return d;
        }
    }
    // 首次生成身份：进程内互斥，避免服务端/客户端线程并发各自生成不同 ID
    static IDENTITY_MUTEX: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = IDENTITY_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    if let Ok(content) = std::fs::read_to_string(identity_file()) {
        if let Ok(mut d) = serde_json::from_str::<DeviceIdentity>(&content) {
            d.os = os;
            return d;
        }
    }
    let name = hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "VinePalmaFlow".to_string());
    let rand4 = || Uuid::new_v4().simple().to_string()[..4].to_string();
    let d = DeviceIdentity {
        id: format!("dev_{}_{}", rand4(), rand4()),
        name,
        os,
    };
    let _ = std::fs::create_dir_all(config_root());
    // 写占位文件后改名，避免并发读取到半成品
    let tmp = identity_file().with_extension("json.tmp");
    let _ = std::fs::write(&tmp, serde_json::to_string_pretty(&d).unwrap_or_default());
    let _ = std::fs::rename(&tmp, identity_file());
    d
}

pub fn current_identity() -> DeviceIdentity {
    ensure_identity()
}

fn load_trusted() -> Vec<TrustedDevice> {
    std::fs::read_to_string(trusted_file())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_trusted(list: &[TrustedDevice]) {
    let _ = std::fs::create_dir_all(config_root());
    let _ = std::fs::write(trusted_file(), serde_json::to_string_pretty(list).unwrap_or_default());
}

fn is_trusted(id: &str) -> bool {
    load_trusted().iter().any(|t| t.id == id)
}

fn build_service(identity: &DeviceIdentity, port: u16) -> Option<ServiceInfo> {
    let host = format!("{}.local.", identity.id);
    let props = vec![
        ("id", identity.id.clone()),
        ("name", identity.name.clone()),
        ("os", identity.os.clone()),
        ("v", "1".to_string()),
    ];
    let ip = local_ip().unwrap_or_else(|| "127.0.0.1".into());
    ServiceInfo::new(
        SERVICE_TYPE,
        &identity.id,
        &host,
        &ip,
        port,
        props.as_slice(),
    )
    .ok()
}

fn resolved_to_device(svc: &ResolvedService, self_id: &str) -> Option<DeviceInfo> {
    let props = svc.get_properties();
    let id = props.get("id")?.val_str().to_string();
    if id.is_empty() || id == self_id {
        return None;
    }
    let name = props
        .get("name")
        .map(|p| p.val_str().to_string())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| svc.get_fullname().to_string());
    let os = props.get("os").map(|p| p.val_str().to_string()).unwrap_or_default();
    let addr = svc
        .get_addresses_v4()
        .iter()
        .next()
        .map(|a| a.to_string())
        .unwrap_or_default();
    let trusted = is_trusted(&id);
    Some(DeviceInfo {
        id,
        name,
        os,
        addr,
        port: svc.get_port(),
        online: true,
        trusted,
        last_seen: now_rfc3339(),
    })
}

pub fn self_device_info() -> DeviceInfo {
    let identity = ensure_identity();
    DeviceInfo {
        id: identity.id,
        name: identity.name,
        os: identity.os,
        addr: local_ip().unwrap_or_else(|| "127.0.0.1".into()),
        port: ADVERTISED_PORT,
        online: true,
        trusted: false,
        last_seen: now_rfc3339(),
    }
}

pub fn start(app: AppHandle) -> NetState {
    let identity = ensure_identity();
    let daemon = ServiceDaemon::new().ok();
    let listener = bind_listener();
    let port = listener.as_ref().map(|l| l.local_addr().ok()).flatten()
        .map(|a| a.port())
        .unwrap_or(ADVERTISED_PORT);
    if let Some(d) = daemon.as_ref() {
        if let Some(service) = build_service(&identity, port) {
            let _ = d.register(service);
        }
        let _ = d.browse(SERVICE_TYPE);
    }
    let discovered = Arc::new(Mutex::new(HashMap::new()));
    let pair_sessions: Arc<Mutex<HashMap<String, PairSession>>> = Arc::new(Mutex::new(HashMap::new()));
    let sync_gate = Arc::new(Mutex::new(()));
    let (sync_trigger, sync_rx) = mpsc::channel::<AutoSyncRequest>();
    let state = NetState {
        daemon,
        identity,
        port,
        discovered: Arc::clone(&discovered),
        pair_sessions: Arc::clone(&pair_sessions),
        app,
        sync_gate: Arc::clone(&sync_gate),
        sync_trigger: sync_trigger.clone(),
    };
    if let Some(d) = state.daemon.as_ref() {
        if let Ok(rx) = d.browse(SERVICE_TYPE) {
            let self_id = state.identity.id.clone();
            let map = Arc::clone(&discovered);
            let trigger = sync_trigger.clone();
            std::thread::spawn(move || {
                while let Ok(event) = rx.recv() {
                    if let ServiceEvent::ServiceResolved(svc) = event {
                        if let Some(info) = resolved_to_device(&svc, &self_id) {
                            let trusted_now = info.trusted;
                            let info_id = info.id.clone();
                            {
                                let mut guard = map.lock().unwrap();
                                guard.insert(info_id.clone(), info);
                            }
                            // 受信设备上线：自动触发单台同步
                            if trusted_now {
                                let _ = trigger.send(AutoSyncRequest::Device(info_id));
                            }
                        }
                    }
                }
            });
        }
    }
    if let Some(listener) = listener {
        std::thread::spawn(move || serve(listener, pair_sessions));
    }
    // 应用启动后等待 mDNS 结果，触发首轮全量自动同步
    let startup_trigger = sync_trigger.clone();
    std::thread::spawn(move || {
        std::thread::sleep(AUTO_SYNC_STARTUP_DELAY);
        let _ = startup_trigger.send(AutoSyncRequest::All);
    });
    spawn_auto_sync_worker(state.port, Arc::clone(&discovered), sync_gate, sync_rx, state.app.clone());
    state
}

/// 自动同步 worker：串行处理「按设备」与「全量」请求，成功后广播前端刷新事件
fn spawn_auto_sync_worker(
    port: u16,
    discovered: Arc<Mutex<HashMap<String, DeviceInfo>>>,
    gate: Arc<Mutex<()>>,
    rx: mpsc::Receiver<AutoSyncRequest>,
    app: AppHandle,
) {
    std::thread::spawn(move || {
        let mut cooldowns = HashMap::<String, std::time::Instant>::new();
        for req in rx {
            let _guard = gate.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(result) = run_auto_request(port, &discovered, req, &mut cooldowns) {
                if let Ok(ws) = crate::workspace::workspace_path() {
                    let _ = crate::workspace::refresh_sync_status(&ws);
                }
                let _ = app.emit("sync-auto-complete", &result);
            }
        }
    });
}

/// 同设备两次自动同步的最小间隔，避免 mDNS 周期性重复解析触发连发
const AUTO_SYNC_COOLDOWN: Duration = Duration::from_secs(30);

/// 处理单条自动同步请求。无可同步设备 / 同步全部失败 / 处于冷却期时返回 None
fn run_auto_request(
    port: u16,
    discovered: &Mutex<HashMap<String, DeviceInfo>>,
    req: AutoSyncRequest,
    cooldowns: &mut HashMap<String, std::time::Instant>,
) -> Option<crate::models::SyncSummary> {
    if crate::workspace::workspace_path().is_err() {
        return None;
    }
    let cool = |cooldowns: &HashMap<String, std::time::Instant>, id: &str| {
        cooldowns
            .get(id)
            .map(|t| t.elapsed() < AUTO_SYNC_COOLDOWN)
            .unwrap_or(false)
    };
    let mut any = false;
    let mut result = crate::models::SyncSummary::default();
    match req {
        AutoSyncRequest::Device(id) => {
            if cool(cooldowns, &id) {
                return None;
            }
            let dev = discovered.lock().unwrap().get(&id).cloned();
            if let Some(dev) = dev {
                if is_trusted(&dev.id) && dev.online {
                    cooldowns.insert(id.clone(), std::time::Instant::now());
                    if let Ok(part) = sync_device(port, &dev) {
                        any = true;
                        result = part;
                    }
                }
            }
        }
        AutoSyncRequest::All => {
            let list: Vec<DeviceInfo> = discovered.lock().unwrap().values().cloned().collect();
            for dev in list {
                if !is_trusted(&dev.id) || !dev.online || cool(cooldowns, &dev.id) {
                    continue;
                }
                cooldowns.insert(dev.id.clone(), std::time::Instant::now());
                match sync_device(port, &dev) {
                    Ok(part) => {
                        any = true;
                        result.devices += 1;
                        result.pushed += part.pushed;
                        result.pulled += part.pulled;
                        result.merged += part.merged;
                        result.conflicted += part.conflicted;
                    }
                    Err(_) => {}
                }
            }
        }
    }
    any.then_some(result)
}

fn bind_listener() -> Option<TcpListener> {
    let bind = |port: u16| {
        TcpListener::bind(("0.0.0.0", port)).ok()
            .or_else(|| TcpListener::bind(("127.0.0.1", port)).ok())
    };
    bind(port_override()).or_else(|| bind(ADVERTISED_PORT)).or_else(|| TcpListener::bind(("0.0.0.0", 0)).ok())
}

fn port_override() -> u16 {
    std::env::var("LOCALFLOW_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(ADVERTISED_PORT)
}

pub fn list_devices(state: &NetState) -> Vec<DeviceInfo> {
    let trusted = load_trusted();
    let discovered = state.discovered.lock().unwrap();
    let mut map: HashMap<String, DeviceInfo> = discovered.clone();
    drop(discovered);
    for t in trusted {
        if let Some(entry) = map.get_mut(&t.id) {
            entry.trusted = true;
        } else {
            map.insert(
                t.id.clone(),
                DeviceInfo {
                    id: t.id.clone(),
                    name: t.name.clone(),
                    os: String::new(),
                    addr: String::new(),
                    port: 0,
                    online: false,
                    trusted: true,
                    last_seen: t.last_seen.clone(),
                },
            );
        }
    }
    let mut list: Vec<DeviceInfo> = map.into_values().collect();
    list.sort_by(|a, b| {
        (b.online as u8)
            .cmp(&(a.online as u8))
            .then_with(|| a.name.cmp(&b.name))
    });
    list
}

pub fn rename_device(state: &NetState, name: String) -> Result<DeviceInfo, Error> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(Error::Config("设备名不能为空".into()));
    }
    if name.chars().count() > 40 {
        return Err(Error::Config("设备名过长（≤40 字符）".into()));
    }
    let mut identity = ensure_identity();
    identity.name = name;
    let _ = std::fs::create_dir_all(config_root());
    let _ = std::fs::write(identity_file(), serde_json::to_string_pretty(&identity).unwrap_or_default());
    if let Some(d) = state.daemon.as_ref() {
        if let Some(service) = build_service(&identity, state.port) {
            let _ = d.register(service);
        }
    }
    Ok(self_device_info())
}

pub fn trust_device(id: &str, name: Option<String>) -> Result<(), Error> {
    let mut list = load_trusted();
    if !list.iter().any(|t| t.id == id) {
        let now = now_rfc3339();
        list.push(TrustedDevice {
            id: id.to_string(),
            name: name.unwrap_or_else(|| id.to_string()),
            first_seen: now.clone(),
            last_seen: now,
        });
        save_trusted(&list);
    }
    Ok(())
}

pub fn untrust_device(id: &str) -> Result<(), Error> {
    let list: Vec<TrustedDevice> = load_trusted().into_iter().filter(|t| t.id != id).collect();
    save_trusted(&list);
    Ok(())
}

fn gen_code() -> String {
    let n = (Uuid::new_v4().as_u128() % 1_000_000) as u32;
    format!("{n:06}")
}

fn self_id() -> String {
    ensure_identity().id
}

fn self_name() -> String {
    ensure_identity().name
}

fn ws_host(addr: &str) -> String {
    let host = if addr.is_empty() || addr == "0.0.0.0" { "127.0.0.1".to_string() } else { addr.to_string() };
    host
}

pub(crate) fn connect_ws(
    addr: &str,
    port: u16,
) -> Result<tungstenite::protocol::WebSocket<crate::tls::TlsClientStream>, Error> {
    let host = ws_host(addr);
    let tls = crate::tls::connect_tls(&host, port, PAIR_TIMEOUT)?;
    let url = format!("wss://{host}:{port}");
    let (ws, _) = tungstenite::client(url, tls)
        .map_err(|e| Error::Io(format!("无法连接 {addr}:{port}：{e}")))?;
    Ok(ws)
}

pub(crate) fn send_json<W: std::io::Read + std::io::Write>(ws: &mut tungstenite::WebSocket<W>, value: serde_json::Value) -> Result<(), Error> {
    ws.send(tungstenite::Message::text(value.to_string()))
        .map_err(|e| Error::Io(format!("发送失败：{e}")))
}

pub(crate) fn recv_json<W: std::io::Read + std::io::Write>(ws: &mut tungstenite::WebSocket<W>) -> Result<serde_json::Value, Error> {
    match ws.read() {
        Ok(tungstenite::Message::Text(t)) => serde_json::from_str(&t).map_err(|e| Error::Parse(e.to_string())),
        Ok(_) => Err(Error::Io("收到非预期消息".into())),
        Err(e) => Err(Error::Io(format!("连接中断：{e}"))),
    }
}

fn mark_completed(sessions: &Mutex<HashMap<String, PairSession>>, key: &str) {
    let mut map = sessions.lock().unwrap();
    if let Some(s) = map.get_mut(key) {
        if s.peer_verified && s.self_verified && s.status != "done" {
            let name = s.device_name.clone();
            let id = s.device_id.clone();
            s.status = "done".to_string();
            drop(map);
            let _ = trust_device(&id, Some(name));
        }
    }
}

/// 处理对方连入的 WebSocket 消息（hello / pair_entered / sync_*），返回需要回发的 JSON。
/// `peer_id` 为 TLS 客户端证书 CN 解析出的认证后设备身份。
fn handle_client_message(text: &str, sessions: &Mutex<HashMap<String, PairSession>>, peer_id: &str) -> Option<serde_json::Value> {
    let v: serde_json::Value = serde_json::from_str(text).ok()?;
    let t = v.get("t")?.as_str()?.to_string();
    let id = v.get("id")?.as_str()?.to_string();
    match t.as_str() {
        "hello" => {
            let name = v.get("name").and_then(|n| n.as_str()).unwrap_or("未知设备").to_string();
            if is_trusted(&id) {
                return Some(json!({ "t": "welcome", "status": "trusted", "id": self_id() }));
            }
            let mut map = sessions.lock().unwrap();
            let entry = map.entry(id.clone()).or_insert_with(|| PairSession {
                device_id: id.clone(),
                device_name: name.clone(),
                device_addr: v.get("addr").and_then(|a| a.as_str()).unwrap_or("").to_string(),
                device_port: v.get("port").and_then(|p| p.as_u64()).unwrap_or(0) as u16,
                code_local: gen_code(),
                code_peer: String::new(),
                peer_verified: false,
                self_verified: false,
                status: "pairing".into(),
                created_at: now_rfc3339(),
            });
            Some(json!({ "t": "pair_start", "id": entry.device_id, "name": entry.device_name, "code": entry.code_local }))
        }
        "pair_entered" => {
            let name = v.get("name").and_then(|n| n.as_str()).unwrap_or("未知设备").to_string();
            let code = v.get("code").and_then(|c| c.as_str()).unwrap_or("");
            let my_code = v.get("my_code").and_then(|c| c.as_str()).unwrap_or("");
            let mut map = sessions.lock().unwrap();
            let entry = map.entry(id.clone()).or_insert_with(|| PairSession {
                device_id: id.clone(),
                device_name: name.clone(),
                device_addr: String::new(),
                device_port: 0,
                code_local: gen_code(),
                code_peer: String::new(),
                peer_verified: false,
                self_verified: false,
                status: "pairing".into(),
                created_at: now_rfc3339(),
            });
            if !my_code.is_empty() {
                entry.code_peer = my_code.to_string();
            }
            if code == entry.code_local {
                entry.peer_verified = true;
            }
            let valid = entry.peer_verified;
            drop(map);
            mark_completed(sessions, &id);
            Some(json!({ "t": "ack", "valid": valid, "done": is_done(sessions, &id), "id": self_id() }))
        }
        "sync_list" => {
            if peer_id.is_empty() || !is_trusted(peer_id) {
                return Some(json!({ "t": "sync_error", "msg": "未信任的设备" }));
            }
            let from_id = v.get("from_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let ws = match crate::workspace::workspace_path() {
                Ok(ws) => ws,
                Err(_) => return Some(json!({ "t": "sync_error", "msg": "本机工作区未就绪" })),
            };
            let list = crate::sync::project_hash_map(&ws).unwrap_or_default();
            let projects: Vec<serde_json::Value> = list
                .into_iter()
                .map(|(id, hash)| json!({ "id": id, "hash": hash }))
                .collect();
            Some(json!({ "t": "sync_list", "from_id": from_id, "projects": projects }))
        }
        "sync_send" => {
            if peer_id.is_empty() || !is_trusted(peer_id) {
                return Some(json!({ "t": "sync_error", "msg": "未信任的设备" }));
            }
            let project_id = v.get("project_id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let ws = match crate::workspace::workspace_path() {
                Ok(ws) => ws,
                Err(_) => return Some(json!({ "t": "sync_error", "msg": "本机工作区未就绪" })),
            };
            match crate::sync::build_bundle(&ws, &project_id) {
                Ok(bundle) => Some(json!({ "t": "sync_bundle", "bundle": bundle })),
                Err(e) => Some(json!({ "t": "sync_error", "msg": e.to_string() })),
            }
        }
        "sync_push" => {
            if peer_id.is_empty() || !is_trusted(peer_id) {
                return Some(json!({ "t": "sync_error", "msg": "未信任的来源设备" }));
            }
            let bundle: crate::models::ProjectBundle = match serde_json::from_value(v.get("bundle").cloned().unwrap_or(serde_json::Value::Null)) {
                Ok(b) => b,
                Err(_) => return Some(json!({ "t": "sync_error", "msg": "数据包格式错误" })),
            };
            let ws = match crate::workspace::workspace_path() {
                Ok(ws) => ws,
                Err(_) => return Some(json!({ "t": "sync_error", "msg": "本机工作区未就绪" })),
            };
            match crate::sync::apply_bundle(&ws, peer_id, &bundle) {
                Ok((applied, conflicts)) => {
                    let _ = crate::workspace::refresh_sync_status(&ws);
                    let _ = crate::workspace::generate_summary(&ws);
                    Some(json!({ "t": "sync_push_ack", "applied": applied, "conflicts": conflicts }))
                }
                Err(e) => Some(json!({ "t": "sync_error", "msg": e.to_string() })),
            }
        }
        _ => None,
    }
}

fn is_done(sessions: &Mutex<HashMap<String, PairSession>>, key: &str) -> bool {
    sessions.lock().unwrap().get(key).map(|s| s.status == "done").unwrap_or(false)
}

fn serve(listener: TcpListener, sessions: Arc<Mutex<HashMap<String, PairSession>>>) {
    for stream in listener.incoming() {
        let Ok(stream) = stream else { continue };
        let sessions = Arc::clone(&sessions);
        std::thread::spawn(move || {
            let _ = stream.set_read_timeout(Some(PAIR_TIMEOUT));
            let (tls, peer_cert) = match crate::tls::accept_tls(stream) {
                Ok(x) => x,
                Err(_) => return,
            };
            let peer_id = peer_cert
                .as_deref()
                .and_then(crate::tls::cert_common_name)
                .unwrap_or_default();
            let mut ws = match tungstenite::accept(tls) {
                Ok(ws) => ws,
                Err(_) => return,
            };
            while let Ok(tungstenite::Message::Text(t)) = ws.read() {
                if let Some(resp) = handle_client_message(&t, &sessions, &peer_id) {
                    if send_json(&mut ws, resp).is_err() {
                        break;
                    }
                }
            }
        });
    }
}

/// 发起配对：连接对方，发送本机身份，等待对方返回其 6 位配对码
pub fn begin_pair(state: &NetState, device_id: &str) -> Result<PairSession, Error> {
    let dev = state
        .discovered
        .lock()
        .unwrap()
        .get(device_id)
        .cloned()
        .ok_or_else(|| Error::NotFound("未发现该设备，请刷新设备列表".into()))?;
    let mut ws = connect_ws(&dev.addr, dev.port)?;
    send_json(&mut ws, hello_payload(state.port))?;
    let resp = recv_json(&mut ws)?;
    match resp.get("t").and_then(|t| t.as_str()) {
        Some("pair_start") => {
            {
                let mut map = state.pair_sessions.lock().unwrap();
                let entry = map.entry(dev.id.clone()).or_insert_with(|| PairSession {
                    device_id: dev.id.clone(),
                    device_name: dev.name.clone(),
                    device_addr: dev.addr.clone(),
                    device_port: dev.port,
                    code_local: gen_code(),
                    code_peer: resp.get("code").and_then(|c| c.as_str()).unwrap_or("").to_string(),
                    peer_verified: false,
                    self_verified: false,
                    status: "pairing".into(),
                    created_at: now_rfc3339(),
                });
                entry.code_peer = resp.get("code").and_then(|c| c.as_str()).unwrap_or("").to_string();
                Ok(entry.clone())
            }
        }
        Some("welcome") => Err(Error::Config("对方已信任本机，无需再次配对".into())),
        _ => Err(Error::Io("对方响应异常".into())),
    }
}

/// 提交本方核对后的配对码（对方设备屏幕上显示的代码）
pub fn submit_pair_code(state: &NetState, device_id: &str, code: &str) -> Result<PairSession, Error> {
    let session = {
        let map = state.pair_sessions.lock().unwrap();
        map.get(device_id).cloned()
            .ok_or_else(|| Error::Config("请先发起配对".into()))?
    };
    let mut ws = connect_ws(&session.device_addr, session.device_port)?;
    send_json(&mut ws, hello_payload(state.port))?;
    let _ = recv_json(&mut ws)?;
    send_json(&mut ws, json!({
        "t": "pair_entered",
        "id": self_id(),
        "name": self_name(),
        "code": code,
        "my_code": session.code_local,
    }))?;
    let resp = recv_json(&mut ws)?;
    {
        let mut map = state.pair_sessions.lock().unwrap();
        if let Some(s) = map.get_mut(device_id) {
            if resp.get("valid").and_then(|v| v.as_bool()).unwrap_or(false) {
                s.self_verified = true;
            }
            if resp.get("done").and_then(|v| v.as_bool()).unwrap_or(false) {
                s.peer_verified = true;
                s.status = "done".to_string();
                let name = s.device_name.clone();
                let id = s.device_id.clone();
                drop(map);
                let _ = trust_device(&id, Some(name));
            }
        }
    }
    mark_completed(&state.pair_sessions, device_id);
    let map = state.pair_sessions.lock().unwrap();
    map.get(device_id).cloned().ok_or_else(|| Error::Config("配对会话不存在".into()))
}

pub fn pair_sessions(state: &NetState) -> Vec<PairSession> {
    let mut list: Vec<PairSession> = state.pair_sessions.lock().unwrap().values().cloned().collect();
    list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    list
}

pub fn dismiss_pair(state: &NetState, device_id: &str) {
    state.pair_sessions.lock().unwrap().remove(device_id);
}

/// 与某一受信任设备执行双向增量同步（拉取合并 + 推送），返回汇总。
/// 通过全局 sync_gate 串行，避免与自动同步并发互相覆盖。
pub fn sync_with_device(state: &NetState, device: &DeviceInfo) -> Result<crate::models::SyncSummary, Error> {
    let _guard = state.sync_gate.lock().unwrap_or_else(|e| e.into_inner());
    sync_device(state.port, device)
}

/// 与全部在线受信任设备逐个同步，返回合并汇总
pub fn sync_all(state: &NetState) -> crate::models::SyncSummary {
    let _guard = state.sync_gate.lock().unwrap_or_else(|e| e.into_inner());
    let devices = list_devices(state);
    let mut summary = crate::models::SyncSummary::default();
    for d in devices {
        if !d.trusted || !d.online {
            continue;
        }
        match sync_device(state.port, &d) {
            Ok(part) => {
                summary.devices += 1;
                summary.pushed += part.pushed;
                summary.pulled += part.pulled;
                summary.merged += part.merged;
                summary.conflicted += part.conflicted;
            }
            Err(_) => {}
        }
    }
    summary
}

/// 核心单设备同步（调用方需已持有 sync_gate）
fn sync_device(port: u16, device: &DeviceInfo) -> Result<crate::models::SyncSummary, Error> {
    if !is_trusted(&device.id) {
        return Err(Error::Config("该设备尚未信任，请先配对".into()));
    }
    let ws = crate::workspace::workspace_path()?;
    let mut conn = connect_ws(&device.addr, device.port)?;
    send_json(&mut conn, hello_payload(port))?;
    let _ = recv_json(&mut conn)?;

    send_json(&mut conn, json!({ "t": "sync_list", "from_id": self_id() }))?;
    let resp = recv_json(&mut conn)?;
    if resp.get("t").and_then(|t| t.as_str()) == Some("sync_error") {
        return Err(Error::Io(
            resp.get("msg").and_then(|m| m.as_str()).unwrap_or("对方同步失败").to_string(),
        ));
    }
    let mut remote: HashMap<String, String> = HashMap::new();
    if let Some(projects) = resp.get("projects").and_then(|p| p.as_array()) {
        for p in projects {
            let id = p.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let hash = p.get("hash").and_then(|x| x.as_str()).unwrap_or("").to_string();
            remote.insert(id, hash);
        }
    }
    let local = crate::sync::project_hash_map(&ws).unwrap_or_default();
    let mut summary = crate::models::SyncSummary {
        devices: 1,
        ..Default::default()
    };

    for (id, rhash) in &remote {
        let lhash = local.get(id);
        if lhash == Some(rhash) {
            continue;
        }
        send_json(&mut conn, json!({ "t": "sync_send", "project_id": id, "from_id": self_id() }))?;
        let bundle_resp = recv_json(&mut conn)?;
        match bundle_resp.get("t").and_then(|t| t.as_str()) {
            Some("sync_bundle") => {
                if let Some(b) = bundle_resp.get("bundle") {
                    let bundle: crate::models::ProjectBundle = serde_json::from_value(b.clone())
                        .map_err(|e| Error::Parse(e.to_string()))?;
                    let (applied, conflicts) = crate::sync::apply_bundle(&ws, &device.id, &bundle)?;
                    if lhash.is_none() {
                        summary.pulled += 1;
                    }
                    summary.merged += applied;
                    summary.conflicted += conflicts;
                }
            }
            Some("sync_error") => {
                return Err(Error::Io(
                    bundle_resp.get("msg").and_then(|m| m.as_str()).unwrap_or("拉取失败").to_string(),
                ));
            }
            _ => {}
        }
    }

    for (id, lhash) in &local {
        if remote.get(id) == Some(lhash) {
            continue;
        }
        let bundle = crate::sync::build_bundle(&ws, id)?;
        send_json(&mut conn, json!({ "t": "sync_push", "from_id": self_id(), "bundle": bundle }))?;
        let ack = recv_json(&mut conn)?;
        if ack.get("t").and_then(|t| t.as_str()) == Some("sync_push_ack") {
            summary.pushed += 1;
        } else if ack.get("t").and_then(|t| t.as_str()) == Some("sync_error") {
            return Err(Error::Io(
                ack.get("msg").and_then(|m| m.as_str()).unwrap_or("推送失败").to_string(),
            ));
        }
    }

    let _ = crate::workspace::refresh_sync_status(&ws);
    Ok(summary)
}

pub(crate) fn hello_payload(port: u16) -> serde_json::Value {
    let identity = ensure_identity();
    json!({
        "t": "hello",
        "id": identity.id,
        "name": identity.name,
        "os": identity.os,
        "addr": local_ip().unwrap_or_default(),
        "port": port,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_sessions() -> Arc<Mutex<HashMap<String, PairSession>>> {
        Arc::new(Mutex::new(HashMap::new()))
    }

    fn isolate_config() -> std::sync::MutexGuard<'static, ()> {
        crate::testutil::isolate_config_guard()
    }

    #[test]
    fn hello_creates_pair_start_with_code() {
        let _g = isolate_config();
        let sessions = test_sessions();
        let resp = handle_client_message(
            r#"{"t":"hello","id":"dev_a","name":"PC-A","addr":"192.168.1.5","port":4485}"#,
            &sessions,
            "dev_a",
        )
        .unwrap();
        let code = resp.get("code").and_then(|c| c.as_str()).unwrap();
        assert_eq!(code.len(), 6);
        assert!(code.chars().all(|c| c.is_ascii_digit()));
        let map = sessions.lock().unwrap();
        let s = map.get("dev_a").unwrap();
        assert_eq!(s.code_local, code);
        assert_eq!(s.device_name, "PC-A");
    }

    #[test]
    fn pair_entered_validates_code() {
        let _g = isolate_config();
        let sessions = test_sessions();
        let pair_start = handle_client_message(
            r#"{"t":"hello","id":"dev_a","name":"PC-A"}"#,
            &sessions,
            "dev_a",
        )
        .unwrap();
        let code = pair_start.get("code").and_then(|c| c.as_str()).unwrap().to_string();

        let wrong = handle_client_message(
            &json!({"t":"pair_entered","id":"dev_a","name":"PC-A","code":"000000","my_code":"654321"}).to_string(),
            &sessions,
            "dev_a",
        )
        .unwrap();
        assert_eq!(wrong.get("valid").and_then(|v| v.as_bool()), Some(false));
        let map = sessions.lock().unwrap();
        assert!(!map.get("dev_a").unwrap().peer_verified);
        assert_eq!(map.get("dev_a").unwrap().code_peer, "654321");
        drop(map);

        let ok = handle_client_message(
            &json!({"t":"pair_entered","id":"dev_a","name":"PC-A","code":code,"my_code":"654321"}).to_string(),
            &sessions,
            "dev_a",
        )
        .unwrap();
        assert_eq!(ok.get("valid").and_then(|v| v.as_bool()), Some(true));
        let map = sessions.lock().unwrap();
        assert!(map.get("dev_a").unwrap().peer_verified);
    }

    #[test]
    fn mutual_confirmation_completes_and_trusts() {
        let _g = isolate_config();
        let sessions = test_sessions();
        let pair_start = handle_client_message(
            r#"{"t":"hello","id":"dev_a","name":"PC-A"}"#,
            &sessions,
            "dev_a",
        )
        .unwrap();
        let code_local = pair_start.get("code").and_then(|c| c.as_str()).unwrap().to_string();

        {
            let mut map = sessions.lock().unwrap();
            map.get_mut("dev_a").unwrap().self_verified = true;
        }

        let resp = handle_client_message(
            &json!({"t":"pair_entered","id":"dev_a","name":"PC-A","code":code_local,"my_code":"111111"}).to_string(),
            &sessions,
            "dev_a",
        )
        .unwrap();
        assert_eq!(resp.get("done").and_then(|v| v.as_bool()), Some(true));
        assert_eq!(resp.get("valid").and_then(|v| v.as_bool()), Some(true));

        {
            let map = sessions.lock().unwrap();
            assert_eq!(map.get("dev_a").unwrap().status, "done");
        }
        assert!(is_trusted("dev_a"));
    }

    #[test]
    fn sync_list_rejected_for_untrusted_peer() {
        let _g = isolate_config();
        let sessions = test_sessions();
        let resp = handle_client_message(
            r#"{"t":"sync_list","id":"dev_mallory","from_id":"dev_mallory"}"#,
            &sessions,
            "dev_mallory",
        )
        .unwrap();
        assert_eq!(resp.get("t").and_then(|t| t.as_str()), Some("sync_error"));
        assert_eq!(
            resp.get("msg").and_then(|m| m.as_str()),
            Some("未信任的设备")
        );
    }

    #[test]
    fn sync_push_rejected_for_cert_id_not_trusted() {
        let _g = isolate_config();
        // peer_id 来自证书 CN，即使消息声称是可信设备也不放行
        let sessions = test_sessions();
        trust_device("dev_real", Some("Real".into())).unwrap();
        let resp = handle_client_message(
            r#"{"t":"sync_push","id":"dev_attacker","from_id":"dev_real","bundle":{}}"#,
            &sessions,
            "dev_attacker",
        )
        .unwrap();
        assert_eq!(resp.get("t").and_then(|t| t.as_str()), Some("sync_error"));
        assert_eq!(
            resp.get("msg").and_then(|m| m.as_str()),
            Some("未信任的来源设备")
        );
    }

    fn test_workspace() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("localflow-ws-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        crate::workspace::set_active_workspace(&dir).unwrap();
        dir
    }

    fn device(id: &str, online: bool, trusted: bool) -> DeviceInfo {
        DeviceInfo {
            id: id.to_string(),
            name: id.to_string(),
            os: String::new(),
            addr: "127.0.0.1".into(),
            port: 1,
            online,
            trusted,
            last_seen: String::new(),
        }
    }

    #[test]
    fn auto_sync_skips_untrusted_and_offline() {
        let _g = isolate_config();
        let _ws = test_workspace();
        trust_device("dev_t", Some("T".into())).unwrap();
        let map = Mutex::new(HashMap::from([
            ("dev_u".to_string(), device("dev_u", true, false)),
            ("dev_off".to_string(), device("dev_off", false, true)),
        ]));
        let mut cool = HashMap::new();
        assert!(run_auto_request(0, &map, AutoSyncRequest::All, &mut cool).is_none());
        assert!(run_auto_request(0, &map, AutoSyncRequest::Device("dev_u".into()), &mut cool).is_none());
        assert!(run_auto_request(0, &map, AutoSyncRequest::Device("dev_off".into()), &mut cool).is_none());
    }

    #[test]
    fn auto_sync_failed_connection_reports_none() {
        let _g = isolate_config();
        let _ws = test_workspace();
        trust_device("dev_t", Some("T".into())).unwrap();
        let map = Mutex::new(HashMap::from([(
            "dev_t".to_string(),
            device("dev_t", true, true),
        )]));
        // 端口 1 无监听：连接失败被吞掉，不崩溃、不误报成功
        let mut cool = HashMap::new();
        assert!(run_auto_request(0, &map, AutoSyncRequest::Device("dev_t".into()), &mut cool).is_none());
    }

    #[test]
    fn auto_sync_cooldown_suppresses_retries() {
        let _g = isolate_config();
        let _ws = test_workspace();
        trust_device("dev_t", Some("T".into())).unwrap();
        let map = Mutex::new(HashMap::from([(
            "dev_t".to_string(),
            device("dev_t", true, true),
        )]));
        let mut cool: HashMap<String, std::time::Instant> = HashMap::new();
        let req = AutoSyncRequest::Device("dev_t".into());
        let _ = run_auto_request(0, &map, req, &mut cool);
        // 冷却期内直接跳过（即使设备已在线）
        assert!(run_auto_request(0, &map, AutoSyncRequest::Device("dev_t".into()), &mut cool).is_none());
    }
}
