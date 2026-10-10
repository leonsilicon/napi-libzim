import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import {
  Archive,
  Blob,
  Creator,
  FileItem,
  FileProvider,
  IllustrationInfo,
  IntegrityCheck,
  Query,
  Searcher,
  StringItem,
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
  const content = Buffer.from([0, 255, 0, 128, 0]);
  const blob = new Blob(content);
  content.fill(1);
  expect(blob.data).toEqual(Buffer.from([0, 255, 0, 128, 0]));
  const bytes = new Uint8Array([1, 0, 2]);
  expect(new Blob(bytes.buffer).data).toEqual(Buffer.from([1, 0, 2]));
  const filename = join(directory, "bytes.bin");
  writeFileSync(filename, blob.data);
  const provider = new FileProvider(filename);
  expect(provider.size).toBe(5);
  expect(provider.feed().data).toEqual(blob.data);
  expect(provider.feed().size).toBe(0);
});

test("pending writes finish in order, including file items and redirects", async () => {
  const directory = fixture(),
    path = join(directory, "test.zim"),
    file = join(directory, "item.bin");
  writeFileSync(file, Buffer.from([0, 1, 0, 2]));
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
  expect(archive.getEntryByPath("bytes").item.data.data).toEqual(Buffer.from([0, 1, 0, 2]));
  expect(archive.getEntryByPath("bytes").item.getData(1n, 2n).data).toEqual(Buffer.from([1, 0]));
  expect(archive.getEntryByPath("redirect").getItem(true).path).toBe("hello");
  expect(archive.getEntryByPath("alias").item.data.data).toEqual(Buffer.from([0, 1, 0, 2]));
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
      const chunks = [new Blob("ab"), new Blob("\0cd"), new Blob()];
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
  expect(archive.getEntryByPath("custom").item.data.data).toEqual(Buffer.from("ab\0cd"));
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
  expect(archive.getIllustrationItem(info).data.toString()).toBe("test-data");
  expect(archive.getIllustrationInfos(16, 24, 2)).toHaveLength(1);
  expect(archive.getIllustrationInfos(16, 24, 3)).toHaveLength(0);
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
