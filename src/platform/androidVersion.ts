// Android versionCode from the release version (D-058): MAJOR·10000 + MINOR·100 + PATCH, so
// 1.9.0 → 10900 and every release installs over the one before. Read by tools/android-sync.ts,
// which writes android/app/version.properties for Gradle.

/** Throws on anything but a plain `x.y.z` with minor and patch below 100. */
export function versionCode(version: string): number {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (m === null) throw new Error(`version ${version}: expected MAJOR.MINOR.PATCH`);
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (minor > 99 || patch > 99)
    throw new Error(`version ${version}: minor and patch must be < 100`);
  const code = major * 10000 + minor * 100 + patch;
  if (code < 1) throw new Error(`version ${version}: versionCode must be at least 1`);
  return code;
}
