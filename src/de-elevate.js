'use strict';

// Terminal sem permissão de administrador (RF-03, RN-07, ADR 0014).
// O painel roda elevado; para abrir um shell sem esse privilégio, o PTY executa um
// PowerShell auxiliar que cria um token restrito do próprio processo (grupos de
// administrador viram "somente negar" e os privilégios são removidos, como no UAC) e
// inicia o shell com ele, herdando o console do PTY. O script é ESTÁTICO (ADR 0006): a
// linha de comando e a pasta chegam só por PP_PARAMS e nada do cliente é concatenado.

const path = require('node:path');
const { encode } = require('./powershell');

const POWERSHELL = path.join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
);

const SCRIPT = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PainelSemAdmin {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO {
    public int cb; public string lpReserved; public string lpDesktop; public string lpTitle;
    public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr p, uint access, out IntPtr token);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool CreateRestrictedToken(IntPtr token, uint flags, uint a, IntPtr b, uint c, IntPtr d, uint e, IntPtr f, out IntPtr newToken);
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool CreateProcessAsUser(IntPtr token, string app, string cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr h, out uint code);
  public static int Run(string cmdline, string cwd) {
    IntPtr token, restricted;
    // TOKEN_DUPLICATE | TOKEN_QUERY | TOKEN_ASSIGN_PRIMARY | TOKEN_ADJUST_DEFAULT
    if (!OpenProcessToken(GetCurrentProcess(), 0x2 | 0x8 | 0x1 | 0x80, out token)) throw new Exception("OpenProcessToken " + Marshal.GetLastWin32Error());
    // DISABLE_MAX_PRIVILEGE (0x1) | LUA_TOKEN (0x4)
    if (!CreateRestrictedToken(token, 0x1 | 0x4, 0, IntPtr.Zero, 0, IntPtr.Zero, 0, IntPtr.Zero, out restricted)) throw new Exception("CreateRestrictedToken " + Marshal.GetLastWin32Error());
    var si = new STARTUPINFO(); si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
    PROCESS_INFORMATION pi;
    if (!CreateProcessAsUser(restricted, null, cmdline, IntPtr.Zero, IntPtr.Zero, true, 0, IntPtr.Zero, cwd, ref si, out pi)) throw new Exception("CreateProcessAsUser " + Marshal.GetLastWin32Error());
    WaitForSingleObject(pi.hProcess, 0xFFFFFFFF);
    uint code; GetExitCodeProcess(pi.hProcess, out code);
    return (int)code;
  }
}
'@
exit ([PainelSemAdmin]::Run([string]$p.cmdline, [string]$p.cwd))
`;

// Os argumentos vêm das definições de shell do próprio painel e da distribuição já validada
// (DISTRO_NAME), mas ainda assim são colocados entre aspas quando necessário.
function quote(arg) {
  if (arg !== '' && !/[\s"]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

// Devolve o executável, os argumentos e as variáveis de ambiente que o PTY deve usar para
// abrir `file args` sem privilégio de administrador.
function lowPrivilegeLaunch({ file, args = [], cwd, env = process.env }) {
  const cmdline = [file, ...args].map(quote).join(' ');
  return {
    file: POWERSHELL,
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encode(SCRIPT)],
    env: { ...env, PP_PARAMS: JSON.stringify({ cmdline, cwd }) },
  };
}

module.exports = { lowPrivilegeLaunch, SCRIPT, quote };
