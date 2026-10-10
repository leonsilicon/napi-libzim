import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import {
  Archive,
  Creator,
  FileItem,
  FileProvider,
  IllustrationInfo,
  IntegrityCheck,
  Query,
  Searcher,
  StringItem,
  StringProvider,
  type ContentProvider,
} from "../src/index.ts";
const directories: string[] = [];
function fixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "napi-libzim-test-"));
  directories.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

test("binary copies, ArrayBuffers, and file providers preserve embedded NUL bytes", () => {
  const directory = fixture();
  const content = new Uint8Array([0, 255, 0, 128, 0]);
  const source = new StringProvider(content);
  content.fill(1);
  const data = source.feed();
  expect(data).toEqual(new Uint8Array([0, 255, 0, 128, 0]));
  expect(Buffer.isBuffer(data)).toBe(false);
  const bytes = new Uint8Array([1, 0, 2]);
  const arrayBufferProvider = new StringProvider(bytes.buffer);
  bytes.fill(9);
  expect(arrayBufferProvider.feed()).toEqual(new Uint8Array([1, 0, 2]));
  const filename = join(directory, "bytes.bin");
  writeFileSync(filename, data);
  const provider = new FileProvider(filename);
  expect(provider.size).toBe(5);
  const chunk = provider.feed();
  expect(chunk).toEqual(data);
  expect(Buffer.isBuffer(chunk)).toBe(false);
  expect(provider.feed().byteLength).toBe(0);
});

test("pending writes finish in order, including file items and redirects", async () => {
  const directory = fixture(),
    path = join(directory, "test.zim"),
    file = join(directory, "item.bin");
  writeFileSync(file, new Uint8Array([0, 1, 0, 2]));
  const creator = new Creator().startZimCreation(path);
  const pending = [
    creator.addItem(new FileItem("bytes", "application/octet-stream", "Bytes", {}, file)),
    creator.addItem(
      new StringItem("hello", "text/html", "Hello", { FRONT_ARTICLE: 1 }, "<p>hello</p>"),
    ),
  ];
  creator.addRedirection("redirect", "Redirect", "hello");
  creator.addAlias("alias", "Alias", "bytes");
  creator.setMainPath("hello");
  await creator.finishZimCreation();
  await Promise.all(pending);
  const archive = new Archive(path);
  const item = archive.getEntryByPath("bytes").item;
  const data = item.data;
  expect(data).toEqual(new Uint8Array([0, 1, 0, 2]));
  expect(data.constructor).toBe(Uint8Array);
  expect(Buffer.isBuffer(data)).toBe(false);
  data.fill(255);
  expect(item.data).toEqual(new Uint8Array([0, 1, 0, 2]));
  const slice = item.getData(1n, 2n);
  expect(slice).toEqual(new Uint8Array([1, 0]));
  expect(slice.constructor).toBe(Uint8Array);
  expect(archive.getEntryByPath("redirect").getItem(true).path).toBe("hello");
  expect(archive.getEntryByPath("alias").item.data).toEqual(new Uint8Array([0, 1, 0, 2]));
  expect(Archive.validate(path, Object.values(IntegrityCheck).slice(0, -1))).toBe(true);
  expect(() => archive.getEntryByPath("missing")).toThrow();
  expect(() => archive.getEntryByPath(-1)).toThrow();
  expect(() => archive.getEntryByPath("bytes").item.getData(-1)).toThrow();
  await expect(creator.finishZimCreation()).rejects.toThrow();
  expect(() => creator.configNbWorkers(1)).toThrow();
});

test("custom chunk providers and index data survive their JavaScript lifetime", async () => {
  const path = join(fixture(), "custom.zim");
  const creator = new Creator().configIndexing(true, "en").startZimCreation(path);
  await creator.addItem({
    path: "custom",
    mimeType: "text/plain",
    title: "Custom",
    hints: { FRONT_ARTICLE: 1 },
    getContentProvider() {
      const encoder = new TextEncoder();
      const chunks = [encoder.encode("ab"), encoder.encode("\0cd"), new Uint8Array()];
      return { size: 5, feed: () => chunks.shift()! };
    },
    getIndexData: () => ({
      title: "Special",
      content: "uniquetoken",
      wordcount: 1,
      position: [true, 1, 2],
    }),
  });
  await creator.finishZimCreation();
  const archive = new Archive(path);
  expect(archive.getEntryByPath("custom").item.data).toEqual(new TextEncoder().encode("ab\0cd"));
  expect(new Searcher(archive).search("uniquetoken").getResults(0, 10).size).toBe(1);
  expect(
    new Searcher(archive).search(new Query("uniquetoken").setGeorange(1, 2, 100)).getResults(0, 10)
      .size,
  ).toBe(1);
});

test("multi-archive searches retain earlier searches after addArchive", async () => {
  const directory = fixture(),
    values: Archive[] = [];
  for (let i = 0; i < 2; i++) {
    const path = join(directory, `${i}.zim`);
    const creator = new Creator().configIndexing(true, "en").startZimCreation(path);
    await creator.addItem(
      new StringItem(
        `entry${i}`,
        "text/html",
        `Title ${i}`,
        { FRONT_ARTICLE: 1 },
        "<p>uniquetoken</p>",
      ),
    );
    await creator.finishZimCreation();
    values.push(new Archive(path));
  }
  const searcher = new Searcher(values[0]),
    previous = searcher.search("uniquetoken");
  searcher.addArchive(values[1]);
  const results = Array.from(searcher.search("uniquetoken").getResults(0, 10));
  expect(results.map((hit) => hit.entry.path).sort()).toEqual(["entry0", "entry1"]);
  expect(results.map((hit) => hit.fileIndex).sort((a, b) => a - b)).toEqual([0, 1]);
  expect(Array.from(previous.getResults(0, 10)).map((hit) => hit.entry.path)).toEqual(["entry0"]);
  expect(new Searcher(values).search("uniquetoken").getResults(0, 10).size).toBe(2);
});

test("illustration metadata round-trips with dimensions, scale, and extra attributes", async () => {
  const info = new IllustrationInfo({
    width: 16,
    height: 24,
    scale: 2,
    extraAttributes: { purpose: "icon" },
  });
  const parsed = IllustrationInfo.fromMetadataItemName(info.asMetadataItemName());
  expect(parsed.width).toBe(16);
  expect(parsed.height).toBe(24);
  expect(parsed.scale).toBe(2);
  expect(parsed.extraAttributes).toEqual({ purpose: "icon" });
  const path = join(fixture(), "illustration.zim"),
    creator = new Creator().startZimCreation(path);
  creator.addIllustration(info, "test-data");
  await creator.finishZimCreation();
  const archive = new Archive(path);
  expect(new TextDecoder().decode(archive.getIllustrationItem(info).data)).toBe("test-data");
  expect(archive.getIllustrationInfos(16, 24, 2)).toHaveLength(1);
  expect(archive.getIllustrationInfos(16, 24, 3)).toHaveLength(0);
});

test("typed-array views, Buffer inputs, UTF-8, and empty content round-trip as owned bytes", async () => {
  const path = join(fixture(), "typed-arrays.zim");
  const creator = new Creator().startZimCreation(path);
  const storage = new Uint8Array([99, 0, 128, 255, 0, 98]);
  const view = storage.subarray(1, 5);
  const pending = creator.addItem(new StringItem("view", "application/octet-stream", "", {}, view));
  creator.addMetadata("binary", view);
  creator.addIllustration(16, view);
  storage.fill(7);
  const bufferStorage = Buffer.from([99, 0, 128, 255, 0, 98]);
  const buffered = creator.addItem(
    new StringItem("buffer", "application/octet-stream", "", {}, bufferStorage.subarray(1, 5)),
  );
  bufferStorage.fill(8);
  const text = "\uFEFF雪🙂\0";
  await creator.addItem(new StringItem("utf8", "text/plain", "", {}, text));
  await creator.addItem(
    new StringItem("empty", "application/octet-stream", "", {}, new Uint8Array()),
  );
  await creator.finishZimCreation();
  await Promise.all([pending, buffered]);
  const archive = new Archive(path);
  const expected = new Uint8Array([0, 128, 255, 0]);
  for (const entry of ["view", "buffer"])
    expect(archive.getEntryByPath(entry).item.data).toEqual(expected);
  expect(archive.getMetadataItem("binary").data).toEqual(expected);
  expect(archive.getIllustrationItem(16).data).toEqual(expected);
  expect(archive.getEntryByPath("utf8").item.data).toEqual(new TextEncoder().encode(text));
  const empty = archive.getEntryByPath("empty").item.data;
  expect(empty.constructor).toBe(Uint8Array);
  expect(empty.byteLength).toBe(0);
});

test("providers can reuse Uint8Array views without overwriting earlier chunks", async () => {
  const path = join(fixture(), "reused-chunks.zim");
  const creator = new Creator().startZimCreation(path);
  const storage = new Uint8Array([99, 1, 2, 98]);
  const chunk = storage.subarray(1, 3);
  let sent = 0;
  await creator.addItem({
    path: "chunks",
    mimeType: "application/octet-stream",
    title: "",
    hints: {},
    getContentProvider: () => ({
      size: 4,
      feed() {
        if (sent++ === 2) return new Uint8Array();
        chunk.set(sent === 1 ? [1, 2] : [0, 255]);
        return chunk;
      },
    }),
  });
  storage.fill(7);
  await creator.finishZimCreation();
  expect(new Archive(path).getEntryByPath("chunks").item.data).toEqual(
    new Uint8Array([1, 2, 0, 255]),
  );
});

test("invalid provider chunks and mismatched sizes reject before writing", async () => {
  const path = join(fixture(), "invalid-providers.zim");
  const creator = new Creator().startZimCreation(path);
  const add = (provider: ContentProvider) =>
    creator.addItem({
      path: "invalid",
      mimeType: "text/plain",
      title: "",
      hints: {},
      getContentProvider: () => provider,
    });
  await expect(add({ size: 1, feed: () => "x" as unknown as Uint8Array })).rejects.toThrow(
    "must return a Uint8Array",
  );
  await expect(add({ size: 0, feed: () => new Uint8Array([1]) })).rejects.toThrow("more bytes");
  await expect(add({ size: 1, feed: () => new Uint8Array() })).rejects.toThrow("fewer bytes");
  await creator.finishZimCreation();
});

test("queued writes retain the first failure and finish rejects without hanging", async () => {
  const creator = new Creator();
  const item = new StringItem("before-start", "text/plain", "Before start", {}, "data");
  const results = await Promise.allSettled([
    creator.addItem(item),
    creator.addItem(item),
    creator.finishZimCreation(),
  ]);
  for (const result of results) {
    expect(result.status).toBe("rejected");
    if (result.status === "rejected" && results[0].status === "rejected")
      expect(result.reason).toBe(results[0].reason);
  }
});
