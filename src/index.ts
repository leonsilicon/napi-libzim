import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import pLimit from "p-limit";
import { concatUint8Arrays, isUint8Array, stringToUint8Array } from "uint8array-extras";
import * as native from "../binding/index.cjs";

export type Content = ArrayBuffer | Uint8Array | string;
function bytes(content: Content): Uint8Array {
  if (typeof content === "string") return stringToUint8Array(content);
  if (content instanceof ArrayBuffer) return new Uint8Array(content).slice();
  if (isUint8Array(content)) return new Uint8Array(content);
  throw new TypeError("Content must be a string, Uint8Array, or ArrayBuffer");
}
function unsigned(value: number | bigint, name = "value"): bigint {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0))
    throw new RangeError(`${name} must be a non-negative safe integer or bigint`);
  if (typeof value !== "number" && typeof value !== "bigint")
    throw new TypeError(`${name} must be a number or bigint`);
  const n = BigInt(value);
  if (n < 0n || n > 0xffffffffffffffffn) throw new RangeError(`${name} exceeds uint64`);
  return n;
}
function rangeIndex(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 0x7fffffff)
    throw new RangeError("Index must be a non-negative int32");
  return value;
}
function size(value: bigint): number | bigint {
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
}
export class IntegrityCheck {
  static readonly CHECKSUM = Symbol("CHECKSUM");
  static readonly DIRENT_PTRS = Symbol("DIRENT_PTRS");
  static readonly DIRENT_ORDER = Symbol("DIRENT_ORDER");
  static readonly TITLE_INDEX = Symbol("TITLE_INDEX");
  static readonly CLUSTER_PTRS = Symbol("CLUSTER_PTRS");
  static readonly DIRENT_MIMETYPES = Symbol("DIRENT_MIMETYPES");
  static readonly COUNT = Symbol("COUNT");
}
const checks = Object.values(IntegrityCheck);
function checkIndex(check: symbol): number {
  const index = checks.indexOf(check);
  if (index < 0 || index === checks.length - 1)
    throw new TypeError("Expected an IntegrityCheck symbol");
  return index < 5 ? index : index + 1;
}
export class Compression {
  static readonly None = Symbol("None");
  static readonly Zstd = Symbol("Zstd");
}
export interface ContentProvider {
  readonly size: number | bigint;
  feed(): Uint8Array;
}
export class StringProvider implements ContentProvider {
  #data: Uint8Array;
  #sent = false;
  constructor(content: Content) {
    this.#data = bytes(content);
  }
  get size(): number {
    return this.#data.length;
  }
  getSize(): number {
    return this.size;
  }
  feed(): Uint8Array {
    if (this.#sent) return new Uint8Array();
    this.#sent = true;
    return this.#data.slice();
  }
}
const fileFinalizer = new FinalizationRegistry<number>((fd) => {
  closeSync(fd);
});
export class FileProvider implements ContentProvider {
  #fd: number | undefined;
  #size: number;
  #offset = 0;
  constructor(filepath: string) {
    this.#fd = openSync(filepath, "r");
    try {
      this.#size = fstatSync(this.#fd).size;
    } catch (error) {
      closeSync(this.#fd);
      throw error;
    }
    fileFinalizer.register(this, this.#fd, this);
  }
  get size(): number {
    return this.#size;
  }
  getSize(): number {
    return this.size;
  }
  feed(): Uint8Array {
    if (this.#fd === undefined) return new Uint8Array();
    const data = new Uint8Array(Math.min(1024 * 1024, this.#size - this.#offset));
    const read = readSync(this.#fd, data, 0, data.length, this.#offset);
    this.#offset += read;
    if (this.#offset >= this.#size || read === 0) {
      closeSync(this.#fd);
      this.#fd = undefined;
      fileFinalizer.unregister(this);
    }
    return data.subarray(0, read);
  }
}
export interface Hint {
  COMPRESS?: number;
  FRONT_ARTICLE?: number;
}
export interface IndexData {
  hasIndexData?: boolean;
  title?: string;
  content?: string;
  keywords?: string;
  wordcount?: number;
  position?: [boolean, number, number];
}
export interface WriterItem {
  readonly path: string;
  readonly title: string;
  readonly mimeType: string;
  readonly hints: Hint;
  getContentProvider(): ContentProvider;
  getIndexData?(): IndexData;
}
export class StringItem implements WriterItem {
  #path: string;
  #mimeType: string;
  #title: string;
  #hints: Hint;
  #content: Uint8Array;
  constructor(path: string, mimeType: string, title: string, hints: Hint, content: Content) {
    this.#path = String(path);
    this.#mimeType = String(mimeType);
    this.#title = title == null ? "" : String(title);
    this.#hints = { ...hints };
    this.#content = bytes(content);
  }
  get path(): string {
    return this.#path;
  }
  get mimeType(): string {
    return this.#mimeType;
  }
  get title(): string {
    return this.#title;
  }
  get hints(): Hint {
    return { ...this.#hints };
  }
  getContentProvider(): StringProvider {
    return new StringProvider(this.#content);
  }
}
const filePaths = new WeakMap<FileItem, string>();
export class FileItem implements WriterItem {
  #path: string;
  #mimeType: string;
  #title: string;
  #hints: Hint;
  constructor(path: string, mimeType: string, title: string, hints: Hint, filepath: string) {
    this.#path = String(path);
    this.#mimeType = String(mimeType);
    this.#title = title == null ? "" : String(title);
    this.#hints = { ...hints };
    filePaths.set(this, String(filepath));
  }
  get path(): string {
    return this.#path;
  }
  get mimeType(): string {
    return this.#mimeType;
  }
  get title(): string {
    return this.#title;
  }
  get hints(): Hint {
    return { ...this.#hints };
  }
  getContentProvider(): FileProvider {
    return new FileProvider(filePaths.get(this)!);
  }
}
function consume(content: Content | ContentProvider): Uint8Array {
  if (typeof content === "string" || isUint8Array(content) || content instanceof ArrayBuffer)
    return bytes(content);
  const expected = unsigned(content.size, "Provider size");
  const chunks: Uint8Array[] = [];
  let total = 0n;
  for (;;) {
    const data = content.feed();
    if (!isUint8Array(data)) throw new TypeError("ContentProvider.feed() must return a Uint8Array");
    if (data.length === 0) break;
    total += BigInt(data.length);
    if (total > expected) throw new Error("ContentProvider returned more bytes than its size");
    // Providers may reuse a working buffer on their next feed().
    chunks.push(new Uint8Array(data));
  }
  if (total !== expected) throw new Error("ContentProvider returned fewer bytes than its size");
  return concatUint8Arrays(chunks);
}
export interface IIllustrationInfo {
  width?: number;
  height?: number;
  scale?: number;
  extraAttributes?: Record<string, string>;
}
export class IllustrationInfo implements IIllustrationInfo {
  #info: native.Illustration;
  constructor(info: IIllustrationInfo = {}) {
    this.#info = {
      width: info.width ?? 0,
      height: info.height ?? 0,
      scale: Math.fround(info.scale ?? 0),
      attributes: { ...info.extraAttributes },
    };
  }
  get width(): number {
    return this.#info.width;
  }
  get height(): number {
    return this.#info.height;
  }
  get scale(): number {
    return this.#info.scale;
  }
  get extraAttributes(): Record<string, string> {
    return Object.freeze({ ...this.#info.attributes });
  }
  asMetadataItemName(): string {
    return native.illustrationName(this.#info);
  }
  static fromMetadataItemName(name: string): IllustrationInfo {
    return fromIllustration(native.parseIllustration(name));
  }
}
function illustration(info: IIllustrationInfo): native.Illustration {
  const value = new IllustrationInfo(info);
  return {
    width: value.width,
    height: value.height,
    scale: value.scale,
    attributes: value.extraAttributes,
  };
}
function fromIllustration(info: native.Illustration): IllustrationInfo {
  return new IllustrationInfo({ ...info, extraAttributes: info.attributes });
}
export class OpenConfig {
  #preload = true;
  #ranges = 1024;
  get m_preloadXapianDb(): boolean {
    return this.#preload;
  }
  get m_preloadDirentRanges(): number {
    return this.#ranges;
  }
  preloadXapianDb(preload: boolean): this {
    if (typeof preload !== "boolean") throw new TypeError("preloadXapianDb requires a boolean");
    this.#preload = preload;
    return this;
  }
  preloadDirentRanges(ranges: number): this {
    this.#ranges = rangeIndex(ranges);
    return this;
  }
}
export class Creator {
  #native = new native.NativeCreator();
  #queue = pLimit(1);
  #failure?: { error: unknown };
  #finishing = false;
  #enqueue(operation: () => void | Promise<void>): Promise<void> {
    const next = this.#queue(async () => {
      if (this.#failure) throw this.#failure.error;
      try {
        await operation();
      } catch (error) {
        this.#failure = { error };
        throw error;
      }
    });
    // Synchronous metadata methods enqueue writes without returning a promise.
    void next.catch(() => {});
    return next;
  }
  #write(operation: () => void): void {
    if (this.#finishing) throw new Error("Creator has already begun finishing");
    if (this.#queue.activeCount + this.#queue.pendingCount) {
      void this.#enqueue(operation);
    } else operation();
  }
  #configure(kind: number, value: number | bigint, language = ""): this {
    this.#native.configure(kind, unsigned(value), language);
    return this;
  }
  configVerbose(verbose: boolean): this {
    return this.#configure(0, Number(verbose));
  }
  configCompression(value: symbol): this {
    if (value !== Compression.None && value !== Compression.Zstd)
      throw new TypeError("Expected a Compression symbol");
    return this.#configure(1, Number(value === Compression.Zstd));
  }
  configClusterSize(value: number): this {
    return this.#configure(2, value);
  }
  configIndexing(indexing: boolean, language: string): this {
    return this.#configure(3, Number(indexing), language);
  }
  configNbWorkers(value: number): this {
    return this.#configure(4, value);
  }
  startZimCreation(filepath: string): this {
    this.#native.start(filepath);
    return this;
  }
  addItem(item: WriterItem): Promise<void> {
    if (this.#finishing) return Promise.reject(new Error("Creator has already begun finishing"));
    try {
      const path = String(item.path),
        mime = String(item.mimeType),
        title = item.title == null ? "" : String(item.title);
      const filePath = item instanceof FileItem ? filePaths.get(item) : undefined;
      const content =
        filePath === undefined ? consume(item.getContentProvider()) : stringToUint8Array(filePath);
      const index = item.getIndexData?.();
      if (index?.position && index.position.length < 3)
        throw new Error("position must have a length of 3");
      const indexData: native.IndexData = {
        custom: index !== undefined,
        enabled: index?.hasIndexData ?? true,
        title: index?.title ?? "",
        content: index?.content ?? "",
        keywords: index?.keywords ?? "",
        wordcount: index?.wordcount ?? 0,
        positioned: index?.position?.[0] ?? false,
        latitude: index?.position?.[1] ?? 0,
        longitude: index?.position?.[2] ?? 0,
      };
      const compress = item.hints?.COMPRESS ?? -1,
        front = item.hints?.FRONT_ARTICLE ?? -1;
      return this.#enqueue(() =>
        this.#native.addItem(
          path,
          mime,
          title,
          content,
          filePath !== undefined,
          compress,
          front,
          indexData,
        ),
      );
    } catch (error) {
      return Promise.reject(error);
    }
  }
  addMetadata(
    name: string,
    content: Content | ContentProvider,
    mimetype = "text/plain;charset=utf-8",
  ): void {
    const data = consume(content);
    this.#write(() => this.#native.metadata(name, data, mimetype));
  }
  addIllustration(
    sizeOrInfo: number | IIllustrationInfo,
    content: Content | ContentProvider,
  ): void {
    const data = consume(content);
    if (typeof sizeOrInfo === "number")
      this.#write(() => this.#native.illustration(sizeOrInfo, data));
    else {
      const info = illustration(sizeOrInfo);
      this.#write(() => this.#native.illustrationInfo(info, data));
    }
  }
  addRedirection(path: string, title: string, targetPath: string, hints: Hint = {}): void {
    this.#write(() =>
      this.#native.redirect(
        path,
        title,
        targetPath,
        false,
        hints.COMPRESS ?? -1,
        hints.FRONT_ARTICLE ?? -1,
      ),
    );
  }
  addAlias(path: string, title: string, targetPath: string, hints: Hint = {}): void {
    this.#write(() =>
      this.#native.redirect(
        path,
        title,
        targetPath,
        true,
        hints.COMPRESS ?? -1,
        hints.FRONT_ARTICLE ?? -1,
      ),
    );
  }
  setMainPath(path: string): void {
    this.#write(() => this.#native.mainPath(path));
  }
  setUuid(uuid: string): void {
    if (stringToUint8Array(uuid).byteLength !== 16)
      throw new Error("uuid must be 16 characters long");
    this.#write(() => this.#native.uuid(uuid));
  }
  finishZimCreation(): Promise<void> {
    if (this.#finishing) return Promise.reject(new Error("Creator has already begun finishing"));
    this.#finishing = true;
    return this.#enqueue(() => this.#native.finish());
  }
}
export class Item {
  #native: native.NativeItem;
  constructor(value: native.NativeItem) {
    if (!(value instanceof native.NativeItem))
      throw new Error("Item must be constructed internally by another class");
    this.#native = value;
  }
  get title(): string {
    return this.#native.info().title;
  }
  get path(): string {
    return this.#native.info().path;
  }
  get mimetype(): string {
    return this.#native.info().mimetype;
  }
  get size(): number | bigint {
    return size(this.#native.info().size);
  }
  get index(): number {
    return this.#native.info().index;
  }
  get data(): Uint8Array {
    return this.getData();
  }
  getData(offset: number | bigint = 0, limit?: number | bigint): Uint8Array {
    return this.#native.data(
      unsigned(offset, "Offset"),
      limit === undefined ? 0xffffffffffffffffn : unsigned(limit, "Size"),
    );
  }
  get directAccessInformation(): { filename: string; offset: number; isValid: boolean } {
    const info = this.#native.directAccess();
    return Object.freeze({
      filename: info.filename,
      offset: Number(info.offset),
      isValid: info.isValid,
    });
  }
}
export class Entry {
  #native: native.NativeEntry;
  constructor(value: native.NativeEntry) {
    if (!(value instanceof native.NativeEntry))
      throw new Error("Entry must be constructed internally by another class");
    this.#native = value;
  }
  get isRedirect(): boolean {
    return this.#native.info().isRedirect;
  }
  get path(): string {
    return this.#native.info().path;
  }
  get title(): string {
    return this.#native.info().title;
  }
  get index(): number {
    return this.#native.info().index;
  }
  get item(): Item {
    return this.getItem();
  }
  getItem(followRedirect = false): Item {
    return new Item(this.#native.item(followRedirect));
  }
  get redirect(): Item {
    if (!this.isRedirect) throw new Error("Entry is not a redirect");
    return new Item(this.#native.item(true));
  }
  get redirectEntry(): Entry {
    return new Entry(this.#native.redirectEntry());
  }
}
export interface EntryRange extends Iterable<Entry> {
  readonly size: number;
  offset(start: number, maxResults: number): EntryRange;
}
class Range implements EntryRange {
  #native: native.NativeRange;
  constructor(value: native.NativeRange) {
    this.#native = value;
  }
  get size(): number {
    return this.#native.size();
  }
  offset(start: number, maxResults: number): EntryRange {
    return new Range(this.#native.offset(rangeIndex(start), rangeIndex(maxResults)));
  }
  *[Symbol.iterator](): Iterator<Entry> {
    const length = this.size;
    for (let i = 0; i < length; i++) yield new Entry(this.#native.entryAt(i));
  }
}
const archives = new WeakMap<Archive, native.NativeArchive>();
export class Archive {
  #native: native.NativeArchive;
  constructor(filepath: string, config = new OpenConfig()) {
    if (!(config instanceof OpenConfig)) throw new TypeError("Expected an OpenConfig");
    this.#native = new native.NativeArchive(
      filepath,
      config.m_preloadXapianDb,
      config.m_preloadDirentRanges,
    );
    archives.set(this, this.#native);
  }
  get filename(): string {
    return this.#native.info().filename;
  }
  get filesize(): number | bigint {
    return size(this.#native.info().filesize);
  }
  get allEntryCount(): number {
    return this.#native.info().allEntryCount;
  }
  get entryCount(): number {
    return this.#native.info().entryCount;
  }
  get articleCount(): number {
    return this.#native.info().articleCount;
  }
  get mediaCount(): number {
    return this.#native.info().mediaCount;
  }
  get uuid(): string {
    return this.#native.info().uuid;
  }
  getMetadata(name: string): string {
    return this.#native.metadata(name);
  }
  getMetadataItem(name: string): Item {
    return new Item(this.#native.metadataItem(name));
  }
  get metadataKeys(): string[] {
    return this.#native.metadataKeys();
  }
  getIllustrationItem(sizeOrInfo: number | IIllustrationInfo = 48): Item {
    return new Item(
      typeof sizeOrInfo === "number"
        ? this.#native.illustration(sizeOrInfo)
        : this.#native.illustrationInfo(illustration(sizeOrInfo)),
    );
  }
  get illustrationSizes(): Set<number> {
    return new Set(
      this.illustrationInfos
        .filter(
          (info) =>
            info.width === info.height &&
            info.scale === 1 &&
            Object.keys(info.extraAttributes).length === 0,
        )
        .map((info) => info.width),
    );
  }
  getIllustrationSizes(): Set<number> {
    return this.illustrationSizes;
  }
  getIllustrationInfos(width = 0, height = 0, minScale = 0): IllustrationInfo[] {
    return this.#native
      .illustrations(width, height, minScale, arguments.length >= 3)
      .map(fromIllustration);
  }
  get illustrationInfos(): IllustrationInfo[] {
    return this.getIllustrationInfos();
  }
  getEntryByPath(pathOrIndex: string | number): Entry {
    return new Entry(
      typeof pathOrIndex === "number"
        ? this.#native.entryAt(rangeIndex(pathOrIndex), 0)
        : this.#native.entry(pathOrIndex, false),
    );
  }
  getEntryByTitle(titleOrIndex: string | number): Entry {
    return new Entry(
      typeof titleOrIndex === "number"
        ? this.#native.entryAt(rangeIndex(titleOrIndex), 1)
        : this.#native.entry(titleOrIndex, true),
    );
  }
  getEntryByClusterOrder(index: number): Entry {
    return new Entry(this.#native.entryAt(rangeIndex(index), 2));
  }
  get mainEntry(): Entry {
    return new Entry(this.#native.mainEntry());
  }
  get randomEntry(): Entry {
    return new Entry(this.#native.randomEntry());
  }
  hasEntryByPath(path: string): boolean {
    return this.#native.hasEntry(path, false);
  }
  hasEntryByTitle(title: string): boolean {
    return this.#native.hasEntry(title, true);
  }
  hasMainEntry(): boolean {
    return this.#native.hasMainEntry();
  }
  hasIllustration(value: number): boolean {
    return this.#native.hasIllustration(value);
  }
  hasFulltextIndex(): boolean {
    return this.#native.hasFulltextIndex();
  }
  hasTitleIndex(): boolean {
    return this.#native.hasTitleIndex();
  }
  iterByPath(): EntryRange {
    return new Range(this.#native.range(0, "", false));
  }
  iterByTitle(): EntryRange {
    return new Range(this.#native.range(1, "", false));
  }
  iterEfficient(): EntryRange {
    return new Range(this.#native.range(2, "", false));
  }
  findByPath(path: string): EntryRange {
    return new Range(this.#native.range(0, path, true));
  }
  findByTitle(title: string): EntryRange {
    return new Range(this.#native.range(1, title, true));
  }
  get hasChecksum(): boolean {
    return this.#native.info().hasChecksum;
  }
  get checksum(): string {
    return this.#native.info().checksum;
  }
  check(): boolean {
    return this.#native.check();
  }
  checkIntegrity(check: symbol): boolean {
    return this.#native.integrity(checkIndex(check));
  }
  get isMultiPart(): boolean {
    return this.#native.info().isMultiPart;
  }
  get hasNewNamespaceScheme(): boolean {
    return this.#native.info().hasNewNamespaceScheme;
  }
  getDirentCacheMaxSize(): number {
    return this.#native.cache(false);
  }
  getDirentCacheCurrentSize(): number {
    return this.#native.cache(true);
  }
  setDirentCacheMaxSize(value: number): void {
    this.#native.setCache(unsigned(value));
  }
  static validate(filepath: string, checksToRun: symbol[]): boolean {
    return native.validate(filepath, checksToRun.map(checkIndex));
  }
}
export function getClusterCacheMaxSize(): number {
  return native.clusterCache(false);
}
export function getClusterCacheCurrentSize(): number {
  return native.clusterCache(true);
}
export function setClusterCacheMaxSize(value: number): void {
  native.setClusterCache(unsigned(value));
}
export interface Georange {
  latitude: number;
  longitude: number;
  distance: number;
}
export class Query {
  #query: string;
  #range: Georange | null = null;
  constructor(query = "") {
    this.#query = String(query);
  }
  get query(): string {
    return this.#query;
  }
  set query(value: string) {
    this.setQuery(value);
  }
  setQuery(query: string): this {
    if (typeof query !== "string") throw new TypeError("Query must be a string");
    this.#query = query;
    return this;
  }
  get georange(): Georange | null {
    return this.#range && { ...this.#range };
  }
  set georange(value: Georange) {
    this.setGeorange(value);
  }
  setGeorange(range: Georange): this;
  setGeorange(latitude: number, longitude: number, distance: number): this;
  setGeorange(latitudeOrRange: number | Georange, longitude?: number, distance?: number): this {
    const range =
      typeof latitudeOrRange === "object"
        ? latitudeOrRange
        : { latitude: latitudeOrRange, longitude: longitude!, distance: distance! };
    if (![range.latitude, range.longitude, range.distance].every(Number.isFinite))
      throw new TypeError("Expected latitude, longitude, and distance");
    this.#range = {
      latitude: Math.fround(range.latitude),
      longitude: Math.fround(range.longitude),
      distance: Math.fround(range.distance),
    };
    return this;
  }
  toString(): string {
    return this.#query;
  }
}
export class SearchIterator {
  #hit: native.Hit;
  #archives: readonly Archive[];
  constructor(hit: native.Hit, archiveList: readonly Archive[]) {
    this.#hit = hit;
    this.#archives = archiveList;
  }
  get path(): string {
    return this.#hit.path;
  }
  get title(): string {
    return this.#hit.title;
  }
  get score(): number {
    return this.#hit.score;
  }
  get snippet(): string {
    return this.#hit.snippet;
  }
  get wordCount(): number {
    return this.#hit.wordCount;
  }
  get fileIndex(): number {
    return this.#hit.fileIndex;
  }
  get zimId(): string {
    return this.#hit.zimId;
  }
  get entry(): Entry {
    return this.#archives[this.fileIndex].getEntryByPath(this.path);
  }
}
export class SuggestionIterator {
  #hit: native.Hit;
  #archive: Archive;
  constructor(hit: native.Hit, archive: Archive) {
    this.#hit = hit;
    this.#archive = archive;
  }
  get path(): string {
    return this.#hit.path;
  }
  get title(): string {
    return this.#hit.title;
  }
  get snippet(): string {
    return this.#hit.snippet;
  }
  get hasSnippet(): boolean {
    return this.snippet.length > 0;
  }
  get entry(): Entry {
    return this.#archive.getEntryByPath(this.path);
  }
}
export interface SearchResultSet extends Iterable<SearchIterator> {
  readonly size: number;
}
export interface SuggestionResultSet extends Iterable<SuggestionIterator> {
  readonly size: number;
}
class Results<T> implements Iterable<T> {
  #values: T[];
  constructor(values: T[]) {
    this.#values = values;
  }
  get size(): number {
    return this.#values.length;
  }
  [Symbol.iterator](): Iterator<T> {
    return this.#values[Symbol.iterator]();
  }
}
export class Search {
  #native: native.NativeSearch;
  #archives: readonly Archive[];
  constructor(value: native.NativeSearch, archiveList: readonly Archive[]) {
    this.#native = value;
    this.#archives = [...archiveList];
  }
  get estimatedMatches(): number {
    return this.#native.estimated();
  }
  getResults(start: number, maxResults: number): SearchResultSet {
    return new Results(
      this.#native
        .results(rangeIndex(start), rangeIndex(maxResults))
        .map((hit) => new SearchIterator(hit, this.#archives)),
    );
  }
}
export class Searcher {
  #native: native.NativeSearcher;
  #archives: Archive[];
  constructor(archiveOrList: Archive | Archive[]) {
    this.#archives = Array.isArray(archiveOrList) ? [...archiveOrList] : [archiveOrList];
    if (!this.#archives.length) throw new Error("Searcher requires at least one Archive");
    this.#native = new native.NativeSearcher(archives.get(this.#archives[0])!, false);
    for (const archive of this.#archives.slice(1)) this.#native.addArchive(archives.get(archive)!);
  }
  addArchive(archive: Archive): this {
    this.#native.addArchive(archives.get(archive)!);
    this.#archives.push(archive);
    return this;
  }
  setVerbose(verbose: boolean): this {
    this.#native.verbose(verbose);
    return this;
  }
  search(query: string | Query): Search {
    const q = typeof query === "string" ? new Query(query) : query;
    const geo = q.georange;
    return new Search(
      this.#native.search(
        q.query,
        geo !== null,
        geo?.latitude ?? 0,
        geo?.longitude ?? 0,
        geo?.distance ?? 0,
      ),
      this.#archives,
    );
  }
}
export class SuggestionSearch {
  #native: native.NativeSearch;
  #archive: Archive;
  constructor(value: native.NativeSearch, archive: Archive) {
    this.#native = value;
    this.#archive = archive;
  }
  get estimatedMatches(): number {
    return this.#native.estimated();
  }
  getResults(start: number, maxResults: number): SuggestionResultSet {
    return new Results(
      this.#native
        .results(rangeIndex(start), rangeIndex(maxResults))
        .map((hit) => new SuggestionIterator(hit, this.#archive)),
    );
  }
}
export class SuggestionSearcher {
  #native: native.NativeSearcher;
  #archive: Archive;
  constructor(archive: Archive) {
    this.#archive = archive;
    this.#native = new native.NativeSearcher(archives.get(archive)!, true);
  }
  setVerbose(verbose: boolean): this {
    this.#native.verbose(verbose);
    return this;
  }
  suggest(query: string): SuggestionSearch {
    return new SuggestionSearch(this.#native.search(query, false, 0, 0, 0), this.#archive);
  }
}
