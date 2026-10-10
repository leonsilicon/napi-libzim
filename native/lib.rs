mod bridge;
use bridge::ffi;
use cxx::UniquePtr;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::{Arc, Mutex, MutexGuard};

fn result<T>(value: std::result::Result<T, cxx::Exception>) -> Result<T> {
    value.map_err(|e| Error::from_reason(e.to_string()))
}
#[napi(object)]
pub struct ArchiveInfo {
    pub filename: String,
    pub filesize: BigInt,
    pub entry_count: u32,
    pub all_entry_count: u32,
    pub article_count: u32,
    pub media_count: u32,
    pub uuid: String,
    pub checksum: String,
    pub has_checksum: bool,
    pub is_multi_part: bool,
    pub has_new_namespace_scheme: bool,
}
#[napi(object)]
pub struct EntryInfo {
    pub path: String,
    pub title: String,
    pub index: u32,
    pub is_redirect: bool,
}
#[napi(object)]
pub struct ItemInfo {
    pub path: String,
    pub title: String,
    pub mimetype: String,
    pub size: BigInt,
    pub index: u32,
}
#[napi(object)]
pub struct DirectAccess {
    pub filename: String,
    pub offset: BigInt,
    pub is_valid: bool,
}
#[napi(object)]
pub struct Illustration {
    pub width: u32,
    pub height: u32,
    pub scale: f64,
    pub attributes: std::collections::HashMap<String, String>,
}
impl Illustration {
    fn native(&self) -> ffi::Illustration {
        ffi::Illustration {
            width: self.width,
            height: self.height,
            scale: self.scale as f32,
            attributes: self
                .attributes
                .iter()
                .map(|(key, value)| ffi::Attribute {
                    key: key.clone(),
                    value: value.clone(),
                })
                .collect(),
        }
    }
    fn from_native(v: ffi::Illustration) -> Self {
        Self {
            width: v.width,
            height: v.height,
            scale: v.scale.into(),
            attributes: v.attributes.into_iter().map(|a| (a.key, a.value)).collect(),
        }
    }
}
#[napi(object)]
pub struct Hit {
    pub path: String,
    pub title: String,
    pub snippet: String,
    pub score: i32,
    pub word_count: i32,
    pub file_index: i32,
    pub zim_id: String,
}
#[napi(object)]
pub struct IndexData {
    pub custom: bool,
    pub enabled: bool,
    pub title: String,
    pub content: String,
    pub keywords: String,
    pub wordcount: u32,
    pub positioned: bool,
    pub latitude: f64,
    pub longitude: f64,
}
impl IndexData {
    fn native(self) -> ffi::IndexData {
        ffi::IndexData {
            custom: self.custom,
            enabled: self.enabled,
            title: self.title,
            content: self.content,
            keywords: self.keywords,
            wordcount: self.wordcount,
            positioned: self.positioned,
            latitude: self.latitude,
            longitude: self.longitude,
        }
    }
}
#[napi]
pub struct NativeArchive {
    inner: UniquePtr<ffi::Archive>,
}
#[napi]
impl NativeArchive {
    #[napi(constructor)]
    pub fn new(path: String, preload: bool, ranges: u32) -> Result<Self> {
        Ok(Self {
            inner: result(ffi::open_archive(&path, preload, ranges))?,
        })
    }
    #[napi]
    pub fn info(&self) -> Result<ArchiveInfo> {
        let v = result(self.inner.info())?;
        Ok(ArchiveInfo {
            filename: v.filename,
            filesize: v.filesize.into(),
            entry_count: v.entry_count,
            all_entry_count: v.all_entry_count,
            article_count: v.article_count,
            media_count: v.media_count,
            uuid: v.uuid,
            checksum: v.checksum,
            has_checksum: v.has_checksum,
            is_multi_part: v.is_multi_part,
            has_new_namespace_scheme: v.has_new_namespace_scheme,
        })
    }
    #[napi]
    pub fn metadata_keys(&self) -> Result<Vec<String>> {
        result(self.inner.metadata_keys())
    }
    #[napi]
    pub fn metadata(&self, key: String) -> Result<String> {
        result(self.inner.metadata(&key))
    }
    #[napi]
    pub fn metadata_item(&self, key: String) -> Result<NativeItem> {
        Ok(NativeItem {
            inner: result(self.inner.metadata_item(&key))?,
        })
    }
    #[napi]
    pub fn illustration(&self, size: u32) -> Result<NativeItem> {
        Ok(NativeItem {
            inner: result(self.inner.illustration(size))?,
        })
    }
    #[napi]
    pub fn illustration_info(&self, info: Illustration) -> Result<NativeItem> {
        Ok(NativeItem {
            inner: result(self.inner.illustration_info(&info.native()))?,
        })
    }
    #[napi]
    pub fn illustrations(
        &self,
        width: u32,
        height: u32,
        scale: f64,
        filtered: bool,
    ) -> Result<Vec<Illustration>> {
        Ok(result(
            self.inner
                .illustrations(width, height, scale as f32, filtered),
        )?
        .into_iter()
        .map(Illustration::from_native)
        .collect())
    }
    #[napi]
    pub fn entry(&self, key: String, title: bool) -> Result<NativeEntry> {
        Ok(NativeEntry {
            inner: result(self.inner.entry(&key, title))?,
        })
    }
    #[napi]
    pub fn entry_at(&self, index: u32, order: u8) -> Result<NativeEntry> {
        Ok(NativeEntry {
            inner: result(self.inner.entry_at(index, order))?,
        })
    }
    #[napi]
    pub fn main_entry(&self) -> Result<NativeEntry> {
        Ok(NativeEntry {
            inner: result(self.inner.main_entry())?,
        })
    }
    #[napi]
    pub fn random_entry(&self) -> Result<NativeEntry> {
        Ok(NativeEntry {
            inner: result(self.inner.random_entry())?,
        })
    }
    #[napi]
    pub fn has_entry(&self, key: String, title: bool) -> Result<bool> {
        result(self.inner.has_entry(&key, title))
    }
    #[napi]
    pub fn has_main_entry(&self) -> Result<bool> {
        result(self.inner.has_main_entry())
    }
    #[napi]
    pub fn has_fulltext_index(&self) -> Result<bool> {
        result(self.inner.has_fulltext_index())
    }
    #[napi]
    pub fn has_title_index(&self) -> Result<bool> {
        result(self.inner.has_title_index())
    }
    #[napi]
    pub fn has_illustration(&self, size: u32) -> Result<bool> {
        result(self.inner.has_illustration(size))
    }
    #[napi]
    pub fn check(&self) -> Result<bool> {
        result(self.inner.check())
    }
    #[napi]
    pub fn integrity(&mut self, kind: u8) -> Result<bool> {
        result(self.inner.pin_mut().integrity(kind))
    }
    #[napi]
    pub fn cache(&self, current: bool) -> Result<f64> {
        Ok(result(self.inner.cache(current))? as f64)
    }
    #[napi]
    pub fn set_cache(&mut self, size: BigInt) -> Result<()> {
        result(self.inner.pin_mut().set_cache(uint64(size)?))
    }
    #[napi]
    pub fn range(&self, order: u8, prefix: String, filtered: bool) -> Result<NativeRange> {
        Ok(NativeRange {
            inner: result(self.inner.range(order, &prefix, filtered))?,
        })
    }
}
#[napi]
pub struct NativeEntry {
    inner: UniquePtr<ffi::Entry>,
}
#[napi]
impl NativeEntry {
    #[napi]
    pub fn info(&self) -> Result<EntryInfo> {
        let v = result(self.inner.info())?;
        Ok(EntryInfo {
            path: v.path,
            title: v.title,
            index: v.index,
            is_redirect: v.is_redirect,
        })
    }
    #[napi]
    pub fn item(&self, follow: bool) -> Result<NativeItem> {
        Ok(NativeItem {
            inner: result(self.inner.item(follow))?,
        })
    }
    #[napi]
    pub fn redirect_entry(&self) -> Result<NativeEntry> {
        Ok(NativeEntry {
            inner: result(self.inner.redirect_entry())?,
        })
    }
}
#[napi]
pub struct NativeItem {
    inner: UniquePtr<ffi::Item>,
}
#[napi]
impl NativeItem {
    #[napi]
    pub fn info(&self) -> Result<ItemInfo> {
        let v = result(self.inner.info())?;
        Ok(ItemInfo {
            path: v.path,
            title: v.title,
            mimetype: v.mimetype,
            size: v.size.into(),
            index: v.index,
        })
    }
    #[napi]
    pub fn data(&self, offset: BigInt, limit: BigInt) -> Result<Uint8Array> {
        Ok(result(self.inner.data(uint64(offset)?, uint64(limit)?))?.into())
    }
    #[napi]
    pub fn direct_access(&self) -> Result<DirectAccess> {
        let v = result(self.inner.direct_access())?;
        Ok(DirectAccess {
            filename: v.filename,
            offset: v.offset.into(),
            is_valid: v.is_valid,
        })
    }
}
#[napi]
pub struct NativeRange {
    inner: UniquePtr<ffi::Range>,
}
#[napi]
impl NativeRange {
    #[napi]
    pub fn size(&self) -> u32 {
        self.inner.size()
    }
    #[napi]
    pub fn offset(&self, start: u32, count: u32) -> Result<NativeRange> {
        Ok(Self {
            inner: result(self.inner.offset(start, count))?,
        })
    }
    #[napi]
    pub fn entry_at(&self, index: u32) -> Result<NativeEntry> {
        Ok(NativeEntry {
            inner: result(self.inner.entry_at(index))?,
        })
    }
}
#[napi]
pub struct NativeSearcher {
    inner: UniquePtr<ffi::Searcher>,
}
#[napi]
impl NativeSearcher {
    #[napi(constructor)]
    pub fn new(archive: &NativeArchive, suggest: bool) -> Result<Self> {
        Ok(Self {
            inner: result(ffi::new_searcher(&archive.inner, suggest))?,
        })
    }
    #[napi]
    pub fn add_archive(&mut self, archive: &NativeArchive) -> Result<()> {
        result(self.inner.pin_mut().add_archive(&archive.inner))
    }
    #[napi]
    pub fn verbose(&mut self, verbose: bool) {
        self.inner.pin_mut().verbose(verbose);
    }
    #[napi]
    pub fn search(
        &mut self,
        text: String,
        geo: bool,
        lat: f64,
        lon: f64,
        distance: f64,
    ) -> Result<NativeSearch> {
        Ok(NativeSearch {
            inner: result(self.inner.pin_mut().search(
                &text,
                geo,
                lat as f32,
                lon as f32,
                distance as f32,
            ))?,
        })
    }
}
#[napi]
pub struct NativeSearch {
    inner: UniquePtr<ffi::Search>,
}
#[napi]
impl NativeSearch {
    #[napi]
    pub fn estimated(&self) -> Result<u32> {
        result(self.inner.estimated())
    }
    #[napi]
    pub fn results(&self, start: u32, count: u32) -> Result<Vec<Hit>> {
        Ok(result(self.inner.results(start, count))?
            .values
            .into_iter()
            .map(|v| Hit {
                path: v.path,
                title: v.title,
                snippet: v.snippet,
                score: v.score,
                word_count: v.word_count,
                file_index: v.file_index,
                zim_id: v.zim_id,
            })
            .collect())
    }
}
fn uint64(value: BigInt) -> Result<u64> {
    let (negative, n, lossless) = value.get_u64();
    if negative || !lossless {
        Err(Error::from_reason("Expected an unsigned 64-bit integer"))
    } else {
        Ok(n)
    }
}
type SharedCreator = Arc<Mutex<UniquePtr<ffi::Creator>>>;
fn lock(creator: &SharedCreator) -> Result<MutexGuard<'_, UniquePtr<ffi::Creator>>> {
    creator
        .lock()
        .map_err(|_| Error::from_reason("Creator lock poisoned"))
}
#[napi]
pub struct NativeCreator {
    inner: SharedCreator,
}
#[napi]
impl NativeCreator {
    #[napi(constructor)]
    pub fn new() -> Result<Self> {
        Ok(Self {
            inner: Arc::new(Mutex::new(result(ffi::new_creator())?)),
        })
    }
    #[napi]
    pub fn configure(&self, kind: u8, value: BigInt, language: String) -> Result<()> {
        result(
            lock(&self.inner)?
                .pin_mut()
                .configure(kind, uint64(value)?, &language),
        )
    }
    #[napi]
    pub fn start(&self, path: String) -> Result<()> {
        result(lock(&self.inner)?.pin_mut().start(&path))
    }
    #[napi(ts_return_type = "Promise<void>")]
    #[allow(clippy::too_many_arguments)]
    pub fn add_item(
        &self,
        path: String,
        mime: String,
        title: String,
        content: Uint8Array,
        file: bool,
        compress: i64,
        front: i64,
        index: IndexData,
    ) -> AsyncTask<AddItemTask> {
        AsyncTask::new(AddItemTask {
            creator: self.inner.clone(),
            path,
            mime,
            title,
            content: content.to_vec(),
            file,
            compress,
            front,
            index: index.native(),
        })
    }
    #[napi]
    pub fn metadata(&self, key: String, content: Uint8Array, mime: String) -> Result<()> {
        result(lock(&self.inner)?.pin_mut().metadata(&key, &content, &mime))
    }
    #[napi]
    pub fn illustration(&self, size: u32, content: Uint8Array) -> Result<()> {
        result(lock(&self.inner)?.pin_mut().illustration(size, &content))
    }
    #[napi]
    pub fn illustration_info(&self, info: Illustration, content: Uint8Array) -> Result<()> {
        result(
            lock(&self.inner)?
                .pin_mut()
                .illustration_info(&info.native(), &content),
        )
    }
    #[napi]
    pub fn redirect(
        &self,
        path: String,
        title: String,
        target: String,
        alias: bool,
        compress: i64,
        front: i64,
    ) -> Result<()> {
        result(
            lock(&self.inner)?
                .pin_mut()
                .redirect(&path, &title, &target, alias, compress, front),
        )
    }
    #[napi]
    pub fn main_path(&self, path: String) -> Result<()> {
        result(lock(&self.inner)?.pin_mut().main_path(&path))
    }
    #[napi]
    pub fn uuid(&self, uuid: String) -> Result<()> {
        result(lock(&self.inner)?.pin_mut().uuid(&uuid))
    }
    #[napi(ts_return_type = "Promise<void>")]
    pub fn finish(&self) -> AsyncTask<FinishTask> {
        AsyncTask::new(FinishTask {
            creator: self.inner.clone(),
        })
    }
}
pub struct AddItemTask {
    creator: SharedCreator,
    path: String,
    mime: String,
    title: String,
    content: Vec<u8>,
    file: bool,
    compress: i64,
    front: i64,
    index: ffi::IndexData,
}
impl Task for AddItemTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> {
        result(lock(&self.creator)?.pin_mut().add_item(
            &self.path,
            &self.mime,
            &self.title,
            &self.content,
            self.file,
            self.compress,
            self.front,
            &self.index,
        ))
    }
    fn resolve(&mut self, _env: Env, _output: ()) -> Result<()> {
        Ok(())
    }
}
pub struct FinishTask {
    creator: SharedCreator,
}
impl Task for FinishTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> {
        result(lock(&self.creator)?.pin_mut().finish())
    }
    fn resolve(&mut self, _env: Env, _output: ()) -> Result<()> {
        Ok(())
    }
}
#[napi]
pub fn libzim_version() -> String {
    ffi::libzim_version()
}
#[napi]
pub fn validate(path: String, checks: Vec<u8>) -> Result<bool> {
    result(ffi::validate(&path, &checks))
}
#[napi]
pub fn cluster_cache(current: bool) -> f64 {
    ffi::cluster_cache(current) as f64
}
#[napi]
pub fn set_cluster_cache(size: BigInt) -> Result<()> {
    ffi::set_cluster_cache(uint64(size)?);
    Ok(())
}
#[napi]
pub fn illustration_name(info: Illustration) -> Result<String> {
    result(ffi::illustration_name(&info.native()))
}
#[napi]
pub fn parse_illustration(name: String) -> Result<Illustration> {
    Ok(Illustration::from_native(result(ffi::parse_illustration(
        &name,
    ))?))
}
