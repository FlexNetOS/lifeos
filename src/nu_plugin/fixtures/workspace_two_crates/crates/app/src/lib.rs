pub fn answer_text() -> String {
    format!("answer={}", codedb_fixture_helper::answer())
}

#[cfg(test)]
mod tests {
    #[test]
    fn uses_workspace_helper() {
        assert_eq!(super::answer_text(), "answer=42");
    }
}
