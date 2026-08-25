mod audit;
mod auth;
mod backup;
mod commands;
mod db;
mod error;
mod instance;
mod inventory;
mod license;
mod money;
mod paths;
mod printing;
mod purchases;
mod sales;
mod transfers;
pub mod updater;
mod util;

use commands::AppState;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::EnvFilter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = paths::ensure_dirs();
    let file = RollingFileAppender::new(Rotation::DAILY, paths::logs_dir(), "app.log");
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with_writer(file)
        .with_ansi(false)
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            match crate::instance::acquire() {
                Ok(lock) => {
                    app.manage(lock);
                }
                Err(e) => {
                    tracing::error!("instance lock failed: {}", e.details);
                    return Err(e.user_message.into());
                }
            }
            updater::sync_version_on_startup();
            match db::initialize() {
                Ok(pool) => {
                    app.manage(AppState::new(pool));

                    if let Some(window) = app.get_webview_window("main") {
                        let win_clone = window.clone();
                        window.on_window_event(move |event| {
                            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                                api.prevent_close();
                                let win = win_clone.clone();
                                std::thread::spawn(move || {
                                    let confirmed = win
                                        .dialog()
                                        .message("هل تريد إغلاق البرنامج؟")
                                        .title("تأكيد الإغلاق")
                                        .kind(MessageDialogKind::Warning)
                                        .buttons(MessageDialogButtons::OkCancelCustom(
                                            "إغلاق".into(),
                                            "إلغاء".into(),
                                        ))
                                        .blocking_show();
                                    if confirmed {
                                        let _ = win.destroy();
                                    }
                                });
                            }
                        });
                    }
                    let handle = app.handle().clone();
                    std::thread::Builder::new()
                        .name("pos-maintenance".into())
                        .spawn(move || {
                            std::thread::sleep(Duration::from_secs(3));
                            if let Some(state) = handle.try_state::<AppState>() {
                                if let Err(e) = commands::maybe_startup_backup(&state) {
                                    tracing::warn!(details = %e.details, "startup backup skipped");
                                }
                            }
                            let mut tick: u64 = 0;
                            loop {
                                std::thread::sleep(Duration::from_secs(60));
                                tick += 1;
                                let Some(state) = handle.try_state::<AppState>() else {
                                    break;
                                };
                                if state.shutting_down.load(Ordering::SeqCst) {
                                    break;
                                }
                                if let Err(e) = commands::maybe_periodic_backup(&state) {
                                    tracing::warn!(details = %e.details, "periodic backup skipped");
                                }
                                if let Err(e) = commands::maybe_wal_checkpoint(&state) {
                                    tracing::warn!(details = %e.details, "wal checkpoint skipped");
                                }
                                if tick % 60 == 0 {
                                    if let Err(e) = commands::maybe_incremental_vacuum(&state) {
                                        tracing::warn!(details = %e.details, "incremental vacuum skipped");
                                    }
                                }
                                // Every 30 minutes: run stock reconciliation check silently
                                if tick % 30 == 0 {
                                    if let Ok(conn) = commands::take_conn_from(&state) {
                                        match crate::inventory::reconcile_stock(&conn) {
                                            Ok(m) if !m.is_empty() => {
                                                tracing::warn!(count = m.len(), "periodic check: stock drift detected");
                                            }
                                            _ => {}
                                        }
                                    }
                                }
                            }
                        })
                        .ok();
                }
                Err(e) => {
                    tracing::error!("db init failed: {}", e.details);
                    return Err(e.user_message.into());
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            crate::license::check_license,
            crate::license::activate_license,
            commands::app_status,
            commands::complete_first_run,
            commands::list_employees,
            commands::open_shift,
            commands::close_shift,
            commands::unlock_shift,
            commands::list_shifts,
            commands::dashboard_summary,
            commands::list_notifications,
            commands::list_categories,
            commands::list_brands,
            commands::save_brand,
            commands::save_category,
            commands::deactivate_catalog_item,
            commands::list_units,
            commands::list_products,
            commands::catalog_stats,
            commands::import_test_catalog,
            commands::pick_catalog_csv,
            commands::search_products,
            commands::lookup_barcode,
            commands::save_product,
            commands::list_locations,
            commands::save_warehouse,
            commands::list_stock,
            commands::adjust_stock,
            commands::opening_balance,
            commands::list_movements,
            commands::pos_complete_sale,
            commands::pos_void_sale,
            commands::pos_return_sale,
            commands::list_sales,
            commands::get_sale,
            commands::list_returns,
            commands::hold_invoice,
            commands::list_held,
            commands::resume_held,
            commands::receive_purchase_cmd,
            commands::list_purchases,
            commands::create_transfer_cmd,
            commands::complete_transfer_cmd,
            commands::quick_transfer_to_store,
            commands::advance_transfer,
            commands::list_transfers,
            commands::list_customers,
            commands::get_customer,
            commands::lookup_customer_phone,
            commands::ensure_customer_phone,
            commands::lookup_customer_name,
            commands::ensure_customer_name,
            commands::save_customer,
            commands::list_suppliers,
            commands::save_supplier,
            commands::list_expenses,
            commands::list_expense_categories,
            commands::save_expense,
            commands::cash_move,
            commands::list_cash_drawer,
            commands::list_payment_methods,
            commands::complete_stocktake,
            commands::get_settings,
            commands::save_settings,
            commands::app_info,
            commands::list_users,
            commands::list_roles,
            commands::save_user,
            commands::backup_now,
            commands::restore_backup,
            commands::list_backups,
            commands::delete_backup,
            commands::pick_backup_path,
            commands::pick_backup_folder,
            commands::emergency_backup,
            commands::verify_backup_file,
            commands::db_health,
            commands::run_db_maintenance,
            commands::check_stock_integrity,
            commands::fix_stock_drift,
            commands::list_printers_cmd,
            commands::print_test_page,
            commands::pick_store_logo,
            commands::store_logo_src,
            commands::print_sale_receipt,
            commands::report_profit,
            commands::run_report,
            commands::list_product_movers,
            commands::export_report_pdf,
            commands::pick_report_pdf_path,
            commands::list_audit,
            commands::export_products_csv,
            commands::import_products_csv,
            commands::factory_reset,
            commands::check_update,
            commands::download_and_install_update,
            commands::get_just_updated,
            commands::clear_just_updated,
        ])
        .build(tauri::generate_context!())
        .expect("error while building WATEEN POS")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<AppState>() {
                    commands::graceful_shutdown(&state);
                }
            }
        });
}
