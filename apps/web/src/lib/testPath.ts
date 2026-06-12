import path from "path";

// quick runtime sanity check; not used in build
export function test() {
  const base = path.resolve("apps/web/app/(app)/inventory/stock-in/page.tsx");
  const importerDir = path.dirname(base);
  const target = path.resolve(
    importerDir,
    "../../../src/components/RequireAuth",
  );
  return {
    base,
    importerDir,
    target,
    exists: require("fs").existsSync(target + ".tsx"),
  };
}
