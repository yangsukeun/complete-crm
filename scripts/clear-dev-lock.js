const fs = require("fs");
const path = require("path");
const paths = [
  path.join(process.cwd(), ".next", "dev", "lock"),
  path.join(process.cwd(), ".next", "dev.lock"),
];
for (const lockPath of paths) {
  try {
    fs.unlinkSync(lockPath);
    console.log("Cleared", lockPath);
  } catch (e) {
    if (e.code !== "ENOENT") console.warn(e.message);
  }
}
