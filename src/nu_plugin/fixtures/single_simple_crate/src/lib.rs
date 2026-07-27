//! Minimal crate used as the discovery baseline.

pub fn greeting(name: &str) -> String {
    format!("hello, {name}")
}

#[cfg(test)]
mod tests {
    #[test]
    fn greets_a_name() {
        assert_eq!(super::greeting("CodeDB"), "hello, CodeDB");
    }
}
