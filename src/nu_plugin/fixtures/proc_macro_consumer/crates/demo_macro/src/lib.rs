use proc_macro::TokenStream;

#[proc_macro]
pub fn fixture_answer(_input: TokenStream) -> TokenStream {
    "42u32".parse().expect("static token stream is valid")
}
