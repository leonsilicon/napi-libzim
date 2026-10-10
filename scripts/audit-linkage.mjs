import { execaSync } from "execa";
const binary = process.argv[2];
let output;
if (process.platform === "darwin") {
  output = execaSync("otool", ["-L", binary], { encoding: "utf8" }).stdout;
  const identity = execaSync("otool", ["-D", binary], { encoding: "utf8" })
    .stdout.split("\n")[1]
    ?.trim();
  const links = output
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(" ")[0])
    .filter(Boolean);
  for (const link of links)
    if (link !== identity && !link.startsWith("/usr/lib/") && !link.startsWith("/System/Library/"))
      throw new Error(`Unbundled dependency: ${link}`);
} else if (process.platform === "linux") {
  output = execaSync("ldd", [binary], { encoding: "utf8" }).stdout;
  if (/not found/.test(output)) throw new Error(output);
  const allowed = /^(linux-vdso|ld-linux|lib(c|m|dl|pthread|rt|stdc\+\+|gcc_s)\.)/;
  for (const line of output.split("\n")) {
    const name = line.trim().split(/\s/)[0].split("/").pop();
    if (name && !allowed.test(name)) throw new Error(`Unbundled dependency: ${line}`);
  }
} else {
  // dumpbin is available after entering the MSVC development environment.
  output = execaSync("dumpbin", ["/DEPENDENTS", binary], { encoding: "utf8" }).stdout;
  const dlls = output.match(/[\w.-]+\.dll/gi) ?? [];
  const allowed =
    /^(kernel32|advapi32|user32|shell32|ole32|oleaut32|ws2_32|rpcrt4|winmm|shlwapi|bcrypt|bcryptprimitives|ntdll|ucrtbase|vcruntime\d+(?:_\d+)?|msvcp\d+(?:_\d+)?|api-ms-win-[\w-]+)\.dll$/i;
  for (const dll of dlls) if (!allowed.test(dll)) throw new Error(`Unbundled dependency: ${dll}`);
}
process.stdout.write(output);
