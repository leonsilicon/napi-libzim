#[allow(clippy::too_many_arguments)]
#[cxx::bridge(namespace = "napi_zim")]
pub mod ffi {
    struct ArchiveInfo {
        filename: String,
        filesize: u64,
        entry_count: u32,
        all_entry_count: u32,
        article_count: u32,
        media_count: u32,
        uuid: String,
        checksum: String,
        has_checksum: bool,
        is_multi_part: bool,
        has_new_namespace_scheme: bool,
    }
    struct EntryInfo {
        path: String,
        title: String,
        index: u32,
        is_redirect: bool,
    }
    struct ItemInfo {
        path: String,
        title: String,
        mimetype: String,
        size: u64,
        index: u32,
    }
    struct Hit {
        path: String,
        title: String,
        snippet: String,
        score: i32,
        word_count: i32,
        file_index: i32,
        zim_id: String,
    }
    struct Attribute {
        key: String,
        value: String,
    }
    struct Illustration {
        width: u32,
        height: u32,
        scale: f32,
        attributes: Vec<Attribute>,
    }
    struct DirectAccess {
        filename: String,
        offset: u64,
        is_valid: bool,
    }
    struct IndexData {
        custom: bool,
        enabled: bool,
        title: String,
        content: String,
        keywords: String,
        wordcount: u32,
        positioned: bool,
        latitude: f64,
        longitude: f64,
    }
    struct Hits {
        estimated_matches: u32,
        values: Vec<Hit>,
    }
    unsafe extern "C++" {
        include!("native/bridge.h");
        type Archive;
        type Entry;
        type Item;
        type Creator;
        type Range;
        type Searcher;
        type Search;
        fn open_archive(path: &str, preload: bool, ranges: u32) -> Result<UniquePtr<Archive>>;
        fn info(self: &Archive) -> Result<ArchiveInfo>;
        fn metadata_keys(self: &Archive) -> Result<Vec<String>>;
        fn metadata(self: &Archive, key: &str) -> Result<String>;
        fn metadata_item(self: &Archive, key: &str) -> Result<UniquePtr<Item>>;
        fn illustration(self: &Archive, size: u32) -> Result<UniquePtr<Item>>;
        fn entry(self: &Archive, key: &str, title: bool) -> Result<UniquePtr<Entry>>;
        fn entry_at(self: &Archive, index: u32, order: u8) -> Result<UniquePtr<Entry>>;
        fn main_entry(self: &Archive) -> Result<UniquePtr<Entry>>;
        fn random_entry(self: &Archive) -> Result<UniquePtr<Entry>>;
        fn has_entry(self: &Archive, key: &str, title: bool) -> Result<bool>;
        fn has_main_entry(self: &Archive) -> Result<bool>;
        fn has_fulltext_index(self: &Archive) -> Result<bool>;
        fn has_title_index(self: &Archive) -> Result<bool>;
        fn check(self: &Archive) -> Result<bool>;
        fn range(
            self: &Archive,
            order: u8,
            prefix: &str,
            filtered: bool,
        ) -> Result<UniquePtr<Range>>;
        fn size(self: &Range) -> u32;
        fn offset(self: &Range, start: u32, count: u32) -> Result<UniquePtr<Range>>;
        fn entry_at(self: &Range, index: u32) -> Result<UniquePtr<Entry>>;
        fn illustrations(
            self: &Archive,
            width: u32,
            height: u32,
            scale: f32,
            filtered: bool,
        ) -> Result<Vec<Illustration>>;
        fn illustration_info(self: &Archive, info: &Illustration) -> Result<UniquePtr<Item>>;
        fn has_illustration(self: &Archive, size: u32) -> Result<bool>;
        fn integrity(self: Pin<&mut Archive>, kind: u8) -> Result<bool>;
        fn cache(self: &Archive, current: bool) -> Result<u64>;
        fn set_cache(self: Pin<&mut Archive>, size: u64) -> Result<()>;
        fn validate(path: &str, checks: &[u8]) -> Result<bool>;
        fn cluster_cache(current: bool) -> u64;
        fn set_cluster_cache(size: u64);
        fn illustration_name(info: &Illustration) -> Result<String>;
        fn parse_illustration(name: &str) -> Result<Illustration>;
        fn new_searcher(archive: &Archive, suggest: bool) -> Result<UniquePtr<Searcher>>;
        fn add_archive(self: Pin<&mut Searcher>, archive: &Archive) -> Result<()>;
        fn verbose(self: Pin<&mut Searcher>, verbose: bool);
        fn search(
            self: Pin<&mut Searcher>,
            text: &str,
            geo: bool,
            lat: f32,
            lon: f32,
            distance: f32,
        ) -> Result<UniquePtr<Search>>;
        fn estimated(self: &Search) -> Result<u32>;
        fn results(self: &Search, start: u32, count: u32) -> Result<Hits>;
        fn info(self: &Entry) -> Result<EntryInfo>;
        fn item(self: &Entry, follow: bool) -> Result<UniquePtr<Item>>;
        fn redirect_entry(self: &Entry) -> Result<UniquePtr<Entry>>;
        fn direct_access(self: &Item) -> Result<DirectAccess>;
        fn info(self: &Item) -> Result<ItemInfo>;
        fn data(self: &Item, offset: u64, limit: u64) -> Result<Vec<u8>>;
        fn new_creator() -> Result<UniquePtr<Creator>>;
        fn configure(self: Pin<&mut Creator>, kind: u8, value: u64, language: &str) -> Result<()>;
        fn start(self: Pin<&mut Creator>, path: &str) -> Result<()>;
        fn add_item(
            self: Pin<&mut Creator>,
            path: &str,
            mime: &str,
            title: &str,
            content: &[u8],
            file: bool,
            compress: i64,
            front: i64,
            index: &IndexData,
        ) -> Result<()>;
        fn metadata(self: Pin<&mut Creator>, key: &str, content: &[u8], mime: &str) -> Result<()>;
        fn illustration(self: Pin<&mut Creator>, size: u32, content: &[u8]) -> Result<()>;
        fn illustration_info(
            self: Pin<&mut Creator>,
            info: &Illustration,
            content: &[u8],
        ) -> Result<()>;
        fn redirect(
            self: Pin<&mut Creator>,
            path: &str,
            title: &str,
            target: &str,
            alias: bool,
            compress: i64,
            front: i64,
        ) -> Result<()>;
        fn main_path(self: Pin<&mut Creator>, path: &str) -> Result<()>;
        fn uuid(self: Pin<&mut Creator>, uuid: &str) -> Result<()>;
        fn finish(self: Pin<&mut Creator>) -> Result<()>;
        fn libzim_version() -> String;
    }
}
// A Creator is owned behind a Rust Mutex. Only one worker can access it at a time;
// libzim's internal workers own their content, never JavaScript references.
unsafe impl Send for ffi::Creator {}
