pub mod change_log;
pub mod commands;
pub mod error;
pub mod export;
pub mod frontmatter;
pub mod import;
pub mod models;
pub mod net;
pub mod search;
pub mod sync;
pub mod templates;
pub mod tls;
#[cfg(test)]
pub mod testutil;
pub mod workspace;

pub use error::Error;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(net::start(app.handle().clone()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::init_workspace,
            commands::set_workspace,
            commands::choose_workspace,
            commands::list_projects,
            commands::create_project,
            commands::create_example_project,
            commands::read_project,
            commands::save_project,
            commands::clone_project,
            commands::link_external_folder,
            commands::unlink_project,
            commands::set_project_status,
            commands::read_summary,
            commands::list_snapshots,
            commands::read_snapshot,
            commands::restore_snapshot,
            commands::load_project_changes,
            commands::open_workspace_folder,
            commands::open_project_folder,
            commands::delete_project,
            commands::list_trash,
            commands::restore_project,
            commands::purge_project,
            commands::purge_trash,
            commands::list_attachments,
            commands::add_attachment,
            commands::open_attachment,
            commands::delete_attachment,
            commands::get_templates,
            commands::list_task_files,
            commands::save_task_file,
            commands::delete_task_file,
            commands::render_markdown,
            commands::parse_yaml_meta,
            commands::build_yml,
            commands::load_config,
            commands::save_config,
            commands::export_project,
            commands::export_project_preset,
            commands::export_project_html,
            commands::export_all_markdown,
            commands::refresh_summary,
            commands::get_sync_status,
            commands::refresh_sync_status,
            commands::detect_external_changes,
            commands::search_all,
            commands::get_device_info,
            commands::set_device_name,
            commands::list_devices,
            commands::trust_device,
            commands::untrust_device,
            commands::begin_pair,
            commands::submit_pair_code,
            commands::pair_sessions,
            commands::dismiss_pair,
            commands::sync_all,
            commands::sync_with_device,
            commands::list_sync_conflicts,
            commands::resolve_sync_conflict,
            commands::clear_sync_conflicts,
            commands::import_from_dialog,
            commands::import_folder_from_dialog,
            commands::import_from_path,
            commands::import_commit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
