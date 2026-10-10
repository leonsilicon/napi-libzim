#pragma once
#include "rust/cxx.h"
#include <memory>
#include <variant>
#include <zim/archive.h>
#include <zim/entry.h>
#include <zim/item.h>
#include <zim/search.h>
#include <zim/suggestion.h>
#include <zim/writer/creator.h>

namespace napi_zim {
struct ArchiveInfo;
struct EntryInfo;
struct ItemInfo;
struct Hits;
struct Illustration;
struct DirectAccess;
struct IndexData;
struct Range;
struct Item {
  zim::Item value;
  explicit Item(zim::Item v) : value(std::move(v)) {}
  ItemInfo info() const;
  DirectAccess direct_access() const;
  rust::Vec<uint8_t> data(uint64_t offset, uint64_t limit) const;
};
struct Entry {
  zim::Entry value;
  explicit Entry(zim::Entry v) : value(std::move(v)) {}
  EntryInfo info() const;
  std::unique_ptr<Item> item(bool follow) const;
  std::unique_ptr<Entry> redirect_entry() const;
};
struct Archive {
  zim::Archive value;
  Archive(const std::string &path, zim::OpenConfig config)
      : value(path, config) {}
  ArchiveInfo info() const;
  rust::Vec<rust::String> metadata_keys() const;
  rust::String metadata(rust::Str key) const;
  std::unique_ptr<Item> metadata_item(rust::Str key) const;
  std::unique_ptr<Item> illustration(uint32_t size) const;
  std::unique_ptr<Entry> entry(rust::Str key, bool title) const;
  std::unique_ptr<Entry> entry_at(uint32_t index, uint8_t order) const;
  std::unique_ptr<Entry> main_entry() const;
  std::unique_ptr<Entry> random_entry() const;
  bool has_entry(rust::Str key, bool title) const;
  bool has_main_entry() const;
  bool has_fulltext_index() const;
  bool has_title_index() const;
  bool check() const;
  std::unique_ptr<Range> range(uint8_t order, rust::Str prefix,
                               bool filtered) const;
  rust::Vec<Illustration> illustrations(uint32_t width, uint32_t height,
                                        float scale, bool filtered) const;
  std::unique_ptr<Item> illustration_info(const Illustration &info) const;
  bool has_illustration(uint32_t size) const;
  bool integrity(uint8_t kind);
  uint64_t cache(bool current) const;
  void set_cache(uint64_t size);
};
struct Range {
  using Value =
      std::variant<zim::Archive::EntryRange<zim::EntryOrder::pathOrder>,
                   zim::Archive::EntryRange<zim::EntryOrder::titleOrder>,
                   zim::Archive::EntryRange<zim::EntryOrder::efficientOrder>>;
  Value value;
  template <class T> explicit Range(T v) : value(std::move(v)) {}
  uint32_t size() const;
  std::unique_ptr<Range> offset(uint32_t start, uint32_t count) const;
  std::unique_ptr<Entry> entry_at(uint32_t index) const;
};
struct Search {
  std::variant<zim::Search, zim::SuggestionSearch> value;
  template <class T> explicit Search(T v) : value(std::move(v)) {}
  uint32_t estimated() const;
  Hits results(uint32_t start, uint32_t count) const;
};
struct Searcher {
  std::variant<zim::Searcher, zim::SuggestionSearcher> value;
  Searcher(const Archive &archive, bool suggest);
  void add_archive(const Archive &archive);
  void verbose(bool verbose);
  std::unique_ptr<Search> search(rust::Str text, bool geo, float lat, float lon,
                                 float distance);
};
struct Creator {
  zim::writer::Creator value;
  enum class State { Ready, Started, Finished, Failed };
  State state = State::Ready;
  void require(State expected) const;
  void configure(uint8_t kind, uint64_t value, rust::Str language);
  void start(rust::Str path);
  void add_item(rust::Str path, rust::Str mime, rust::Str title,
                rust::Slice<const uint8_t> content, bool file, int64_t compress,
                int64_t front, const IndexData &index);
  void metadata(rust::Str key, rust::Slice<const uint8_t> content,
                rust::Str mime);
  void illustration(uint32_t size, rust::Slice<const uint8_t> content);
  void illustration_info(const Illustration &info,
                         rust::Slice<const uint8_t> content);
  void redirect(rust::Str path, rust::Str title, rust::Str target, bool alias,
                int64_t compress, int64_t front);
  void main_path(rust::Str path);
  void uuid(rust::Str uuid);
  void finish();
};
std::unique_ptr<Archive> open_archive(rust::Str path, bool preload,
                                      uint32_t ranges);
std::unique_ptr<Creator> new_creator();
rust::String libzim_version();
bool validate(rust::Str path, rust::Slice<const uint8_t> checks);
uint64_t cluster_cache(bool current);
void set_cluster_cache(uint64_t size);
rust::String illustration_name(const Illustration &info);
Illustration parse_illustration(rust::Str name);
std::unique_ptr<Searcher> new_searcher(const Archive &archive, bool suggest);
} // namespace napi_zim
