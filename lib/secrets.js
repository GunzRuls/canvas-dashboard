import { execFileSync } from "child_process";

// Encrypts saved secrets (Canvas token, Gmail app password, Resend key, calendar links) with
// Windows' built-in protection (DPAPI, "current user" scope). Only this Windows account on this
// PC can decrypt them: a copied settings file, or another account on the same PC, just sees
// "dpapi:..." gibberish. It doesn't stop malware already running as you; nothing local can.
//
// Values go to PowerShell through stdin, never the command line, so other programs can't read
// them from the process list. Off Windows, values are stored as they are.

const PREFIX = "dpapi:";

export const canEncrypt = process.platform === "win32";

export function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

// One PowerShell run per batch: stdin is a JSON array of strings, stdout the results in order.
function runBatch(mode, values) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Security",
    "$items = [Console]::In.ReadToEnd() | ConvertFrom-Json",
    "$scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser",
    "$out = @(foreach ($v in @($items)) {",
    mode === "protect"
      ? "  [Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes([string]$v), $null, $scope))"
      : "  [Text.Encoding]::UTF8.GetString([System.Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String([string]$v), $null, $scope))",
    "})",
    "ConvertTo-Json -InputObject $out -Compress",
  ].join("\n");
  const stdout = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input: JSON.stringify(values),
    stdio: ["pipe", "pipe", "pipe"], // keep PowerShell's error text out of the server log
    windowsHide: true,
    timeout: 20000,
    encoding: "utf8",
  });
  const parsed = JSON.parse(stdout.trim() || "[]");
  return Array.isArray(parsed) ? parsed : [parsed];
}

// Encrypts the non-empty, not-yet-encrypted values of `keys` in `obj` (returns a copy).
export function protectFields(obj, keys) {
  if (!canEncrypt) return { ...obj };
  const todo = keys.filter((k) => obj[k] && !isEncrypted(obj[k]));
  if (!todo.length) return { ...obj };
  const result = runBatch("protect", todo.map((k) => String(obj[k])));
  const out = { ...obj };
  todo.forEach((k, i) => {
    out[k] = PREFIX + result[i];
  });
  return out;
}

// Decrypts the encrypted values of `keys` in `obj` (returns a copy). A value that can't be
// decrypted (settings copied from another PC or account) becomes empty, so the app asks again.
export function unprotectFields(obj, keys) {
  const todo = keys.filter((k) => isEncrypted(obj[k]));
  if (!todo.length) return { ...obj };
  const out = { ...obj };
  if (!canEncrypt) {
    todo.forEach((k) => (out[k] = ""));
    return out;
  }
  try {
    const result = runBatch("unprotect", todo.map((k) => obj[k].slice(PREFIX.length)));
    todo.forEach((k, i) => (out[k] = result[i] ?? ""));
  } catch {
    // Batch failed (e.g. one value from another account): try each on its own.
    for (const k of todo) {
      try {
        out[k] = runBatch("unprotect", [obj[k].slice(PREFIX.length)])[0] ?? "";
      } catch {
        out[k] = "";
      }
    }
  }
  return out;
}
