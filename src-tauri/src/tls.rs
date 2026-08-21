//! TLS 1.3 加密传输与设备证书管理。
//!
//! 每个设备在首次启动时生成一张自签证书（CN = 设备 ID），双向 TLS：
//! - 服务端强制要求客户端证书，握手后提取对方证书 CN 作为认证后的设备身份；
//! - 同步等敏感操作只接受「证书 CN ∈ 信任列表」的连接（见 net.rs 的 peer_id 判定）。

use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use rcgen::{CertificateParams, DnType, IsCa, KeyPair};
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::pki_types::{
    CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer, ServerName, UnixTime,
};
use rustls::server::danger::{ClientCertVerifier, ClientCertVerified};
use rustls::{ClientConnection, DigitallySignedStruct, DistinguishedName, ServerConnection, SignatureScheme, StreamOwned};

use crate::Error;

/// 客户端侧 TLS 流类型（供 net.rs 的 WebSocket 泛型使用）
pub(crate) type TlsClientStream = StreamOwned<ClientConnection, TcpStream>;

fn cert_dir() -> PathBuf {
    crate::net::config_root().join("certs")
}

fn ensure_material() -> (Vec<u8>, Vec<u8>) {
    let dir = cert_dir();
    let cert_path = dir.join("tls_cert.der");
    let key_path = dir.join("tls_key.der");
    if let (Ok(c), Ok(k)) = (std::fs::read(&cert_path), std::fs::read(&key_path)) {
        if !c.is_empty() && !k.is_empty() {
            return (c, k);
        }
    }
    let key_pair = KeyPair::generate().expect("生成设备密钥失败");
    let mut params = CertificateParams::new(Vec::<String>::new()).expect("证书参数初始化失败");
    params.distinguished_name.push(DnType::CommonName, crate::net::current_identity().id);
    params.is_ca = IsCa::NoCa;
    params.not_before = rcgen::date_time_ymd(2020, 1, 1);
    params.not_after = rcgen::date_time_ymd(2099, 12, 31);
    let cert = params.self_signed(&key_pair).expect("自签证书生成失败");
    let cert_der = cert.der().as_ref().to_vec();
    let key_der = key_pair.serialize_der();
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(&cert_path, &cert_der);
    let _ = std::fs::write(&key_path, &key_der);
    (cert_der, key_der)
}

fn install_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

fn schemes() -> Vec<SignatureScheme> {
    vec![
        SignatureScheme::ECDSA_NISTP256_SHA256,
        SignatureScheme::ECDSA_NISTP384_SHA384,
        SignatureScheme::ED25519,
        SignatureScheme::RSA_PSS_SHA256,
        SignatureScheme::RSA_PSS_SHA384,
        SignatureScheme::RSA_PSS_SHA512,
    ]
}

/// 接受任意服务器证书（配对阶段无预置信任，认证由 6 位配对码 + 客户端证书身份绑定完成）
#[derive(Debug)]
struct AcceptAnyServerCert;

impl ServerCertVerifier for AcceptAnyServerCert {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Err(rustls::Error::General("已禁用 TLS 1.2".into()))
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        schemes()
    }
}

/// 服务端要求每个连接方都必须出示客户端证书（mandatory），证书内容不校验，
/// 由上层根据证书 CN 与信任列表决定是否放行。
#[derive(Debug)]
struct RequireClientCert;

impl ClientCertVerifier for RequireClientCert {
    fn offer_client_auth(&self) -> bool {
        true
    }

    fn client_auth_mandatory(&self) -> bool {
        true
    }

    fn root_hint_subjects(&self) -> &[DistinguishedName] {
        &[]
    }

    fn verify_client_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _now: UnixTime,
    ) -> Result<ClientCertVerified, rustls::Error> {
        Ok(ClientCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Err(rustls::Error::General("已禁用 TLS 1.2".into()))
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        schemes()
    }
}

fn server_config() -> Arc<rustls::ServerConfig> {
    install_provider();
    let (cert, key) = ensure_material();
    let certs = vec![CertificateDer::from(cert)];
    let key = PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(key));
    Arc::new(
        rustls::ServerConfig::builder_with_protocol_versions(&[&rustls::version::TLS13])
            .with_client_cert_verifier(Arc::new(RequireClientCert))
            .with_single_cert(certs, key)
            .expect("服务器证书加载失败"),
    )
}

fn client_config() -> Arc<rustls::ClientConfig> {
    install_provider();
    let (cert, key) = ensure_material();
    let certs = vec![CertificateDer::from(cert)];
    let key = PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(key));
    Arc::new(
        rustls::ClientConfig::builder_with_protocol_versions(&[&rustls::version::TLS13])
            .dangerous()
            .with_custom_certificate_verifier(Arc::new(AcceptAnyServerCert))
            .with_client_auth_cert(certs, key)
            .expect("客户端证书加载失败"),
    )
}

/// 客户端建立 TLS 1.3 连接并完成握手（携带本机客户端证书）。
pub(crate) fn connect_tls(
    addr: &str,
    port: u16,
    timeout: Duration,
) -> Result<StreamOwned<ClientConnection, TcpStream>, Error> {
    let ip: std::net::IpAddr = addr
        .trim()
        .parse()
        .ok()
        .filter(|a: &std::net::IpAddr| !a.is_unspecified())
        .unwrap_or_else(|| std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST));
    let tcp = TcpStream::connect((ip, port))
        .map_err(|e| Error::Io(format!("无法连接 {addr}:{port}：{e}")))?;
    let _ = tcp.set_read_timeout(Some(timeout));
    let conn = ClientConnection::new(client_config(), ServerName::IpAddress(ip.into()))
        .map_err(|e| Error::Io(format!("TLS 客户端初始化失败：{e}")))?;
    let mut tls = StreamOwned::new(conn, tcp);
    loop {
        if !tls.conn.is_handshaking() {
            break;
        }
        tls.conn
            .complete_io(&mut tls.sock)
            .map_err(|e| Error::Io(format!("TLS 握手失败：{e}")))?;
    }
    Ok(tls)
}

/// 服务端接受一次 TLS 1.3 连接，返回 TLS 流与对方证书 DER（握手完成后解析）。
pub(crate) fn accept_tls(
    tcp: TcpStream,
) -> Result<(StreamOwned<ServerConnection, TcpStream>, Option<Vec<u8>>), Error> {
    let conn = ServerConnection::new(server_config())
        .map_err(|e| Error::Io(format!("TLS 服务端初始化失败：{e}")))?;
    let mut tls = StreamOwned::new(conn, tcp);
    loop {
        if !tls.conn.is_handshaking() {
            break;
        }
        if tls
            .conn
            .complete_io(&mut tls.sock)
            .map_err(|e| Error::Io(format!("TLS 握手失败：{e}")))?
            .0
            == 0
        {
            break;
        }
    }
    let peer_cert = tls
        .conn
        .peer_certificates()
        .and_then(|c| c.first())
        .map(|c| c.as_ref().to_vec());
    Ok((tls, peer_cert))
}

/// 从 DER 证书中解析 CN（即设备 ID）。
pub(crate) fn cert_common_name(der: &[u8]) -> Option<String> {
    use x509_parser::prelude::parse_x509_certificate;
    let (_, cert) = parse_x509_certificate(der).ok()?;
    let cn = cert.subject().iter_common_name().next()?;
    cn.as_str().ok().map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn isolate_config() -> std::sync::MutexGuard<'static, ()> {
        crate::testutil::isolate_config_guard()
    }

    #[test]
    fn generates_cert_with_device_id_cn() {
        let _g = isolate_config();
        let (cert, _key) = ensure_material();
        let cn = cert_common_name(&cert).unwrap();
        assert_eq!(cn, crate::net::current_identity().id);
    }

    #[test]
    fn regenerates_from_disk() {
        let _g = isolate_config();
        let (c1, k1) = ensure_material();
        let (c2, k2) = ensure_material();
        assert_eq!(c1, c2);
        assert_eq!(k1, k2);
    }

    #[test]
    fn loopback_tls13_handshake_with_client_cert() {
        let _g = isolate_config();
        use std::io::{Read, Write};
        use std::net::TcpListener;
        use std::thread;

        let addr = ("127.0.0.1", 0);
        let listener = TcpListener::bind(addr).unwrap();
        let port = listener.local_addr().unwrap().port();
        let (tx, rx) = std::sync::mpsc::channel::<Option<Vec<u8>>>();

        thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
            match accept_tls(stream) {
                Ok((mut tls, peer_cert)) => {
                    let _ = tx.send(peer_cert.clone());
                    let mut buf = [0u8; 4];
                    let _ = tls.read(&mut buf);
                    let _ = tls.write_all(b"pong");
                    let _ = tls.flush();
                }
                Err(_) => {
                    let _ = tx.send(None);
                }
            }
        });

        let mut client = connect_tls("127.0.0.1", port, std::time::Duration::from_secs(5)).unwrap();
        client.write_all(b"ping").unwrap();
        client.flush().unwrap();
        let mut buf = [0u8; 4];
        client.read_exact(&mut buf).unwrap();
        assert_eq!(&buf, b"pong");

        let peer_cert = rx.recv().unwrap().expect("服务端未取得客户端证书");
        let cn = cert_common_name(&peer_cert).unwrap();
        assert_eq!(cn, crate::net::current_identity().id);
    }
}
