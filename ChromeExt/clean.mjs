import fs from "fs";
const dir = process.argv[2];
fs.rmSync(dir, { recursive: true, force: true });
