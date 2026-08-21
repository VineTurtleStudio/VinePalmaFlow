#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("IO 错误: {0}")]
    Io(String),
    #[error("解析错误: {0}")]
    Parse(String),
    #[error("未找到: {0}")]
    NotFound(String),
    #[error("配置错误: {0}")]
    Config(String),
}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Error::Io(e.to_string())
    }
}

impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        Error::Parse(e.to_string())
    }
}

impl From<rust_xlsxwriter::XlsxError> for Error {
    fn from(e: rust_xlsxwriter::XlsxError) -> Self {
        Error::Io(e.to_string())
    }
}

impl serde::Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
