import { rm } from "node:fs/promises";

await rm(".engine-build", { recursive: true, force: true });
console.log("Directorio temporal del motor financiero eliminado.");
