import {
  readdirSync,
  lstatSync,
  realpathSync,
  rmSync,
  existsSync,
} from "node:fs";
import path from "node:path";
const root = path.resolve("data");
if (existsSync(root)) {
  for (const name of readdirSync(root)) {
    if (
      !/^(test-(core|global|intelligence|documents|desktop|installer-data|install|result|backup|prediction)-[a-f0-9-]{36}|e2e-\d+)$/.test(
        name,
      )
    )
      continue;
    const target = path.join(root, name);
    if (lstatSync(target).isSymbolicLink() || !lstatSync(target).isDirectory())
      continue;
    const resolved = realpathSync(target);
    if (
      path.dirname(resolved).toLowerCase() !== realpathSync(root).toLowerCase()
    )
      throw new Error("Test path is outside Molot/data.");
    rmSync(resolved, { recursive: true, force: false });
    console.log(`Removed isolated test data: ${name}`);
  }
}
