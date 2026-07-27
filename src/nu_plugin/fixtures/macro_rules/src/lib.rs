macro_rules! make_label {
    ($name:literal, $value:expr) => {
        pub fn label() -> String {
            format!("{}={}", $name, $value)
        }
    };
}

make_label!("fixture", 7);
