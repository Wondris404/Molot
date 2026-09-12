#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::os::windows::{io::AsRawHandle, process::CommandExt};
use std::{
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    process::{Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use windows_sys::Win32::{Foundation::CloseHandle, System::JobObjects::*};

// A Windows job closes the server and its Python children even after an app crash.
struct ServerJob(isize);
unsafe impl Send for ServerJob {}
impl Drop for ServerJob {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0 as _);
        }
    }
}

fn main() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let resources = std::env::var_os("MOLOT_DESKTOP_RESOURCES")
                .map(PathBuf::from)
                .unwrap_or(app.path().resource_dir()?.join("resources"));
            let data = std::env::var_os("MOLOT_DATA_DIR")
                .map(PathBuf::from)
                .unwrap_or(app.path().app_data_dir()?);
            // Resource APIs may return \\?\ paths; normalize before passing them to Node.
            let resources = dunce::simplified(&resources).to_path_buf();
            let data = dunce::simplified(&data).to_path_buf();
            for name in [
                "uploads",
                "models",
                "teacher-tests",
                "cache",
                "backups",
                "logs",
                "downloads",
                "config",
            ] {
                fs::create_dir_all(data.join(name))?;
            }
            let listener = TcpListener::bind("127.0.0.1:0")?;
            let port = listener.local_addr()?.port();
            drop(listener);
            let log = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(data.join("logs/desktop.log"))?;
            for required in ["node/node.exe", "server/server.js", "python/python.exe", "engine/engine.py"] {
                if !resources.join(required).is_file() {
                    let message = format!("Chýba súčasť aplikácie: {required}. Spusti znova inštalátor Molotu.");
                    writeln!(&log, "startup_missing_component: {required}")?;
                    return Err(message.into());
                }
            }
            let mut child = Command::new(resources.join("node/node.exe"))
                .arg(resources.join("server/server.js"))
                .current_dir(resources.join("server"))
                .env("PORT", port.to_string())
                .env("HOSTNAME", "127.0.0.1")
                .env("MOLOT_DATA_DIR", &data)
                .env("MOLOT_RUNTIME_DIR", &resources)
                .env("MOLOT_ENGINE_SCRIPT", resources.join("engine/engine.py"))
                .env("NEXT_TELEMETRY_DISABLED", "1")
                .env("NODE_ENV", "production")
                .env_remove("NODE_OPTIONS")
                .env_remove("NODE_PATH")
                .env_remove("MOLOT_TEST_BUILD")
                .env_remove("MOLOT_DATA_SUBDIR")
                .creation_flags(0x08000000)
                .stdin(Stdio::null())
                .stdout(log.try_clone()?)
                .stderr(log)
                .spawn()?;
            unsafe {
                let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if job.is_null() {
                    let _ = child.kill();
                    return Err(std::io::Error::last_os_error().into());
                }
                let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                if SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    &limits as *const _ as _,
                    std::mem::size_of_val(&limits) as _,
                ) == 0
                    || AssignProcessToJobObject(job, child.as_raw_handle() as _) == 0
                {
                    CloseHandle(job);
                    let _ = child.kill();
                    return Err(std::io::Error::last_os_error().into());
                }
                app.manage(Mutex::new(ServerJob(job as isize)));
            }
            let address = format!("127.0.0.1:{port}");
            let mut ready = false;
            for _ in 0..300 {
                if let Ok(mut stream) = TcpStream::connect(&address) {
                    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
                    let request = format!("GET /api/health HTTP/1.1\r\nHost: {address}\r\nConnection: close\r\n\r\n");
                    if stream.write_all(request.as_bytes()).is_ok() {
                        let mut response = [0u8; 128];
                        if let Ok(length) = stream.read(&mut response) {
                            let status = String::from_utf8_lossy(&response[..length]);
                            if status.starts_with("HTTP/1.1 200") {
                                ready = true;
                                break;
                            }
                            if status.starts_with("HTTP/1.1 503") {
                                return Err("Databázu sa nepodarilo pripraviť. Tvoje dáta zostali zachované. Podrobnosti sú v logs/desktop.log a logs/molot.jsonl v dátovom priečinku aplikácie.".into());
                            }
                        }
                    }
                }
                if child.try_wait()?.is_some() {
                    break;
                }
                thread::sleep(Duration::from_millis(100));
            }
            if !ready {
                return Err(
                    "Lokálny server sa nespustil. Podrobnosti sú v logs/desktop.log.".into(),
                );
            }
            let origin = format!("http://{address}");
            let allowed = origin.clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(origin.parse()?))
                .title("MOLOT")
                .inner_size(1380.0, 900.0)
                .min_inner_size(760.0, 560.0)
                .data_directory(data.join("cache/webview"))
                .disable_drag_drop_handler()
                .on_navigation(move |url| url.origin().ascii_serialization() == allowed)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!());
    if let Err(error) = result {
        eprintln!("Molot: {error}");
        let message: Vec<u16> = format!("Molot sa nepodarilo spustiť.\n\n{error}\n\nSkús znova spustiť inštalátor. Osobné dáta sú oddelené od aplikácie v %APPDATA%/sk.molot.desktop.").encode_utf16().chain(Some(0)).collect();
        let title: Vec<u16> = "Molot — chyba spustenia"
            .encode_utf16()
            .chain(Some(0))
            .collect();
        unsafe {
            windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW(
                std::ptr::null_mut(),
                message.as_ptr(),
                title.as_ptr(),
                0x10,
            );
        }
    }
}
