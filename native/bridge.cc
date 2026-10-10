#include "napi-libzim/native/bridge.rs.h"
#include <limits>
#include <stdexcept>
#include <zim/search.h>
#include <zim/search_iterator.h>
#include <zim/suggestion.h>
#include <zim/suggestion_iterator.h>
#include <zim/version.h>
#include <zim/writer/contentProvider.h>
#include <zim/writer/item.h>

namespace napi_zim {
static std::string str(rust::Str s) { return std::string(s); }
static std::string bytes(rust::Slice<const uint8_t> s) {
  if (s.empty())
    return {};
  return std::string(reinterpret_cast<const char *>(s.data()), s.size());
}
std::unique_ptr<Archive> open_archive(rust::Str path, bool preload,
                                      uint32_t ranges) {
  zim::OpenConfig config;
  config.preloadXapianDb(preload).preloadDirentRanges(ranges);
  return std::make_unique<Archive>(str(path), config);
}
rust::String libzim_version() { return LIBZIM_VERSION; }
ArchiveInfo Archive::info() const {
  return {value.getFilename(),          value.getFilesize(),
          value.getEntryCount(),        value.getAllEntryCount(),
          value.getArticleCount(),      value.getMediaCount(),
          std::string(value.getUuid()), value.getChecksum(),
          value.hasChecksum(),          value.isMultiPart(),
          value.hasNewNamespaceScheme()};
}
rust::Vec<rust::String> Archive::metadata_keys() const {
  rust::Vec<rust::String> out;
  for (auto &key : value.getMetadataKeys())
    out.push_back(key);
  return out;
}
rust::String Archive::metadata(rust::Str key) const {
  return value.getMetadata(str(key));
}
std::unique_ptr<Item> Archive::metadata_item(rust::Str key) const {
  return std::make_unique<Item>(value.getMetadataItem(str(key)));
}
std::unique_ptr<Item> Archive::illustration(uint32_t size) const {
  return std::make_unique<Item>(value.getIllustrationItem(size));
}
std::unique_ptr<Entry> Archive::entry(rust::Str key, bool title) const {
  return std::make_unique<Entry>(title ? value.getEntryByTitle(str(key))
                                       : value.getEntryByPath(str(key)));
}
std::unique_ptr<Entry> Archive::entry_at(uint32_t index, uint8_t order) const {
  if (index >= value.getAllEntryCount())
    throw std::out_of_range("Entry index out of range");
  return std::make_unique<Entry>(order == 1 ? value.getEntryByTitle(index)
                                 : order == 2
                                     ? value.getEntryByClusterOrder(index)
                                     : value.getEntryByPath(index));
}
std::unique_ptr<Entry> Archive::main_entry() const {
  return std::make_unique<Entry>(value.getMainEntry());
}
std::unique_ptr<Entry> Archive::random_entry() const {
  return std::make_unique<Entry>(value.getRandomEntry());
}
bool Archive::has_entry(rust::Str key, bool title) const {
  return title ? value.hasEntryByTitle(str(key))
               : value.hasEntryByPath(str(key));
}
bool Archive::has_main_entry() const { return value.hasMainEntry(); }
bool Archive::has_fulltext_index() const { return value.hasFulltextIndex(); }
bool Archive::has_title_index() const { return value.hasTitleIndex(); }
bool Archive::check() const { return value.check(); }
EntryInfo Entry::info() const {
  return {value.getPath(), value.getTitle(), value.getIndex(),
          value.isRedirect()};
}
std::unique_ptr<Item> Entry::item(bool follow) const {
  return std::make_unique<Item>(value.getItem(follow));
}
std::unique_ptr<Entry> Entry::redirect_entry() const {
  return std::make_unique<Entry>(value.getRedirectEntry());
}
ItemInfo Item::info() const {
  return {value.getPath(), value.getTitle(), value.getMimetype(),
          value.getSize(), value.getIndex()};
}
rust::Vec<uint8_t> Item::data(uint64_t offset, uint64_t limit) const {
  if (offset > value.getSize())
    throw std::out_of_range("Data offset exceeds item size");
  auto blob = value.getData(offset, std::min(limit, value.getSize() - offset));
  rust::Vec<uint8_t> out;
  out.reserve(blob.size());
  for (size_t i = 0; i < blob.size(); ++i)
    out.push_back(static_cast<uint8_t>(blob.data()[i]));
  return out;
}
std::unique_ptr<Creator> new_creator() { return std::make_unique<Creator>(); }
void Creator::require(State expected) const {
  if (state != expected)
    throw std::logic_error("Invalid Creator state: configure before start, add "
                           "after start, finish once");
}
void Creator::configure(uint8_t kind, uint64_t n, rust::Str language) {
  require(State::Ready);
  switch (kind) {
  case 0:
    value.configVerbose(n != 0);
    break;
  case 1:
    value.configCompression(n == 0 ? zim::Compression::None
                                   : zim::Compression::Zstd);
    break;
  case 2:
    if (!n)
      throw std::invalid_argument("Cluster size must be positive");
    value.configClusterSize(n);
    break;
  case 3:
    value.configIndexing(n != 0, str(language));
    break;
  case 4:
    if (!n || n > UINT32_MAX)
      throw std::invalid_argument("Worker count must be positive");
    value.configNbWorkers(n);
    break;
  default:
    throw std::invalid_argument("Unknown configuration");
  }
}
void Creator::start(rust::Str path) {
  require(State::Ready);
  try {
    value.startZimCreation(str(path));
    state = State::Started;
  } catch (...) {
    state = State::Failed;
    throw;
  }
}
class OwnedIndex : public zim::writer::IndexData {
  bool enabled, positioned;
  std::string title, content, keywords;
  uint32_t wordcount;
  double latitude, longitude;

public:
  explicit OwnedIndex(const napi_zim::IndexData &index)
      : enabled(index.enabled), positioned(index.positioned),
        title(index.title), content(index.content), keywords(index.keywords),
        wordcount(index.wordcount), latitude(index.latitude),
        longitude(index.longitude) {}
  bool hasIndexData() const override { return enabled; }
  std::string getTitle() const override { return title; }
  std::string getContent() const override { return content; }
  std::string getKeywords() const override { return keywords; }
  uint32_t getWordCount() const override { return wordcount; }
  GeoPosition getGeoPosition() const override {
    return {positioned, latitude, longitude};
  }
};
class OwnedItem : public zim::writer::BasicItem {
  std::string content;
  bool file, custom;
  std::shared_ptr<zim::writer::IndexData> index;

public:
  OwnedItem(const std::string &path, const std::string &mime,
            const std::string &title, zim::writer::Hints hints,
            std::string content, bool file, const napi_zim::IndexData &data)
      : BasicItem(path, mime, title, hints), content(std::move(content)),
        file(file), custom(data.custom),
        index(data.custom ? std::make_shared<OwnedIndex>(data) : nullptr) {}
  std::unique_ptr<zim::writer::ContentProvider>
  getContentProvider() const override {
    if (file)
      return std::make_unique<zim::writer::FileProvider>(content);
    return std::make_unique<zim::writer::StringProvider>(content);
  }
  std::shared_ptr<zim::writer::IndexData> getIndexData() const override {
    return custom ? index : zim::writer::Item::getIndexData();
  }
};
void Creator::add_item(rust::Str path, rust::Str mime, rust::Str title,
                       rust::Slice<const uint8_t> content, bool file,
                       int64_t compress, int64_t front,
                       const napi_zim::IndexData &index) {
  require(State::Started);
  zim::writer::Hints hints;
  if (compress >= 0)
    hints[zim::writer::COMPRESS] = compress;
  if (front >= 0)
    hints[zim::writer::FRONT_ARTICLE] = front;
  try {
    value.addItem(std::make_shared<OwnedItem>(
        str(path), str(mime), str(title), hints, bytes(content), file, index));
  } catch (...) {
    state = State::Failed;
    throw;
  }
}
void Creator::metadata(rust::Str key, rust::Slice<const uint8_t> content,
                       rust::Str mime) {
  require(State::Started);
  value.addMetadata(str(key), bytes(content), str(mime));
}
void Creator::illustration(uint32_t size, rust::Slice<const uint8_t> content) {
  require(State::Started);
  value.addIllustration(size, bytes(content));
}
void Creator::redirect(rust::Str path, rust::Str title, rust::Str target,
                       bool alias, int64_t compress, int64_t front) {
  require(State::Started);
  zim::writer::Hints hints;
  if (compress >= 0)
    hints[zim::writer::COMPRESS] = compress;
  if (front >= 0)
    hints[zim::writer::FRONT_ARTICLE] = front;
  if (alias)
    value.addAlias(str(path), str(title), str(target), hints);
  else
    value.addRedirection(str(path), str(title), str(target), hints);
}
void Creator::main_path(rust::Str path) {
  require(State::Started);
  value.setMainPath(str(path));
}
void Creator::uuid(rust::Str uuid) {
  require(State::Started);
  auto raw = str(uuid);
  if (raw.size() != 16)
    throw std::invalid_argument("uuid must be 16 characters long");
  value.setUuid(zim::Uuid(raw.data()));
}
void Creator::finish() {
  require(State::Started);
  state = State::Failed;
  value.finishZimCreation();
  state = State::Finished;
}
} // namespace napi_zim

namespace napi_zim {
static zim::IllustrationInfo native_illustration(const Illustration &info) {
  zim::IllustrationInfo out{info.width, info.height, info.scale, {}};
  for (const auto &a : info.attributes)
    out.extraAttributes[std::string(a.key)] = std::string(a.value);
  return out;
}
static Illustration js_illustration(const zim::IllustrationInfo &info) {
  Illustration out{info.width, info.height, info.scale, {}};
  for (const auto &a : info.extraAttributes)
    out.attributes.push_back({a.first, a.second});
  return out;
}
rust::String illustration_name(const Illustration &info) {
  return native_illustration(info).asMetadataItemName();
}
Illustration parse_illustration(rust::Str name) {
  return js_illustration(
      zim::IllustrationInfo::fromMetadataItemName(str(name)));
}
rust::Vec<Illustration> Archive::illustrations(uint32_t width, uint32_t height,
                                               float scale,
                                               bool filtered) const {
  rust::Vec<Illustration> out;
  for (const auto &info :
       (filtered ? value.getIllustrationInfos(width, height, scale)
                 : value.getIllustrationInfos()))
    out.push_back(js_illustration(info));
  return out;
}
std::unique_ptr<Item>
Archive::illustration_info(const Illustration &info) const {
  return std::make_unique<Item>(
      value.getIllustrationItem(native_illustration(info)));
}
bool Archive::has_illustration(uint32_t size) const {
  return value.hasIllustration(size);
}
void Creator::illustration_info(const Illustration &info,
                                rust::Slice<const uint8_t> content) {
  require(State::Started);
  value.addIllustration(native_illustration(info), bytes(content));
}
bool Archive::integrity(uint8_t kind) {
  if (kind >= static_cast<uint8_t>(zim::IntegrityCheck::COUNT))
    throw std::invalid_argument("Invalid integrity check");
  return value.checkIntegrity(static_cast<zim::IntegrityCheck>(kind));
}
bool validate(rust::Str path, rust::Slice<const uint8_t> checks) {
  zim::IntegrityCheckList flags;
  for (auto kind : checks) {
    if (kind >= static_cast<uint8_t>(zim::IntegrityCheck::COUNT))
      throw std::invalid_argument("Invalid integrity check");
    flags.set(kind);
  }
  return zim::validate(str(path), flags);
}
uint64_t Archive::cache(bool current) const {
  return current ? value.getDirentCacheCurrentSize()
                 : value.getDirentCacheMaxSize();
}
void Archive::set_cache(uint64_t size) { value.setDirentCacheMaxSize(size); }
uint64_t cluster_cache(bool current) {
  return current ? zim::getClusterCacheCurrentSize()
                 : zim::getClusterCacheMaxSize();
}
void set_cluster_cache(uint64_t size) { zim::setClusterCacheMaxSize(size); }
DirectAccess Item::direct_access() const {
  auto info = value.getDirectAccessInformation();
  return {info.filename, info.offset, info.isValid()};
}
std::unique_ptr<Range> Archive::range(uint8_t order, rust::Str prefix,
                                      bool filtered) const {
  if (order == 1)
    return std::make_unique<Range>(filtered ? value.findByTitle(str(prefix))
                                            : value.iterByTitle());
  if (order == 2)
    return std::make_unique<Range>(value.iterEfficient());
  return std::make_unique<Range>(filtered ? value.findByPath(str(prefix))
                                          : value.iterByPath());
}
uint32_t Range::size() const {
  return std::visit([](const auto &v) { return v.size(); }, value);
}
std::unique_ptr<Range> Range::offset(uint32_t start, uint32_t count) const {
  if (start > INT32_MAX || count > INT32_MAX)
    throw std::out_of_range("Range exceeds libzim limits");
  return std::visit(
      [&](const auto &v) {
        return std::make_unique<Range>(v.offset(start, count));
      },
      value);
}
std::unique_ptr<Entry> Range::entry_at(uint32_t index) const {
  if (index >= size())
    throw std::out_of_range("Range index out of bounds");
  return std::visit(
      [&](const auto &v) {
        return std::make_unique<Entry>(*v.offset(index, 1).begin());
      },
      value);
}
Searcher::Searcher(const Archive &archive, bool suggest)
    : value(suggest ? decltype(value)(zim::SuggestionSearcher(archive.value))
                    : decltype(value)(zim::Searcher(archive.value))) {}
std::unique_ptr<Searcher> new_searcher(const Archive &archive, bool suggest) {
  return std::make_unique<Searcher>(archive, suggest);
}
void Searcher::add_archive(const Archive &archive) {
  if (auto *searcher = std::get_if<zim::Searcher>(&value))
    searcher->addArchive(archive.value);
  else
    throw std::logic_error("SuggestionSearcher only supports one archive");
}
void Searcher::verbose(bool verbose) {
  std::visit([&](auto &v) { v.setVerbose(verbose); }, value);
}
std::unique_ptr<Search> Searcher::search(rust::Str text, bool geo, float lat,
                                         float lon, float distance) {
  if (auto *searcher = std::get_if<zim::Searcher>(&value)) {
    zim::Query query(str(text));
    if (geo)
      query.setGeorange(lat, lon, distance);
    return std::make_unique<Search>(searcher->search(query));
  }
  return std::make_unique<Search>(
      std::get<zim::SuggestionSearcher>(value).suggest(str(text)));
}
uint32_t Search::estimated() const {
  return std::visit([](const auto &v) { return v.getEstimatedMatches(); },
                    value);
}
Hits Search::results(uint32_t start, uint32_t count) const {
  if (start > INT32_MAX || count > INT32_MAX)
    throw std::out_of_range("Search range exceeds libzim limits");
  Hits out{estimated(), {}};
  if (auto *search = std::get_if<zim::Search>(&value)) {
    auto results = search->getResults(start, count);
    for (auto it = results.begin(); it != results.end(); ++it)
      out.values.push_back({it.getPath(), it.getTitle(), it.getSnippet(),
                            it.getScore(), it.getWordCount(), it.getFileIndex(),
                            std::string(it.getZimId())});
  } else {
    auto results =
        std::get<zim::SuggestionSearch>(value).getResults(start, count);
    for (auto it = results.begin(); it != results.end(); ++it)
      out.values.push_back(
          {it->getPath(), it->getTitle(), it->getSnippet(), 0, 0, 0, ""});
  }
  return out;
}
} // namespace napi_zim
