//! 测试辅助：隔离 LOCALFLOW_CONFIG_DIR 环境变量。
//!
//! 设备身份/信任/证书测试都通过进程级环境变量 `LOCALFLOW_CONFIG_DIR` 指向各自的临时目录，
//! cargo 并行跑测试时会在不同目录间互相覆盖，必须用全局锁串行化。

use std::sync::{Mutex, MutexGuard};

pub(crate) static CONFIG_LOCK: Mutex<()> = Mutex::new(());

pub(crate) fn isolate_config_guard() -> MutexGuard<'static, ()> {
    let guard = CONFIG_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let dir = std::env::temp_dir().join(format!("localflow-test-{}", uuid::Uuid::new_v4()));
    std::env::set_var("LOCALFLOW_CONFIG_DIR", &dir);
    let _ = std::fs::create_dir_all(&dir);
    guard
}