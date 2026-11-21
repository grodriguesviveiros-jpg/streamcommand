fn main() {
    // A URL do site é embutida no binário com `option_env!`; avisa o Cargo para
    // recompilar quando ela mudar entre builds.
    println!("cargo:rerun-if-env-changed=STREAM_COMMAND_APP_URL");
    tauri_build::build()
}
