import packageJson from "../../package.json";

export const VERSION = packageJson.version;

export function getVersion(): string {
  return VERSION;
}

export const BUILD_DATE = new Date().toISOString().split('T')[0];