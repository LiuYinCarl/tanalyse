//! 模糊测试目标:任意字节输入 → 数据文件校验函数。
//! 本地运行:`cargo +nightly fuzz run parse_data -- -max_total_time=60`

#![no_main]
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(s) = std::str::from_utf8(data) {
        // 任何输入都不应 panic;合法 JSON 需带字符串 version 字段
        let _ = tanalyse_lib::data_io::parse_and_validate(s);
    }
});
