import { uninstallLocal } from "./install-local";

uninstallLocal().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
