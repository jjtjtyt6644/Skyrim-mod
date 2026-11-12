# Dovah Trainer hotkey listener.
# Skyrim reads the keyboard directly, so RegisterHotKey-style global shortcuts
# never fire while the game has focus. A low-level keyboard hook (WH_KEYBOARD_LL)
# sees every key before the game does. Keys are observed, never swallowed.
#
# Args: -Keys "45,112,113"  (virtual-key codes to watch)
# Output, one line per key press:  KEY|<vk>|<foreground process name>
# Exits when stdin closes (i.e. when the trainer quits).
param([string]$Keys = '45')
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

public static class SkyHook {
    delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)] struct KBDLLHOOKSTRUCT { public uint vkCode, scanCode, flags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public int x, y; }

    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int id, HookProc fn, IntPtr mod, uint tid);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int code, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint min, uint max);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);

    static HookProc keepAlive;          // prevent the delegate being garbage-collected
    static IntPtr hook;
    static readonly bool[] watched = new bool[256];
    static readonly bool[] held = new bool[256];

    static string ForegroundProcess() {
        try {
            uint pid; GetWindowThreadProcessId(GetForegroundWindow(), out pid);
            return Process.GetProcessById((int)pid).ProcessName;
        } catch { return ""; }
    }

    static IntPtr Callback(int code, IntPtr wParam, IntPtr lParam) {
        if (code >= 0) {
            var k = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
            int msg = wParam.ToInt32();
            if (k.vkCode < 256 && watched[k.vkCode]) {
                if (msg == 0x100 || msg == 0x104) {            // WM_KEYDOWN / WM_SYSKEYDOWN
                    if (!held[k.vkCode]) {                      // ignore auto-repeat
                        held[k.vkCode] = true;
                        Console.Out.WriteLine("KEY|" + k.vkCode + "|" + ForegroundProcess());
                        Console.Out.Flush();
                    }
                } else if (msg == 0x101 || msg == 0x105) {     // WM_KEYUP / WM_SYSKEYUP
                    held[k.vkCode] = false;
                }
            }
        }
        return CallNextHookEx(hook, code, wParam, lParam);
    }

    public static void Run(string keys) {
        foreach (var s in keys.Split(',')) { int v; if (int.TryParse(s.Trim(), out v) && v > 0 && v < 256) watched[v] = true; }
        // Quit when the parent closes our stdin.
        var t = new Thread(() => { while (Console.In.ReadLine() != null) { } Environment.Exit(0); });
        t.IsBackground = true; t.Start();
        keepAlive = Callback;
        hook = SetWindowsHookEx(13 /* WH_KEYBOARD_LL */, keepAlive, GetModuleHandle(null), 0);
        if (hook == IntPtr.Zero) { Console.Out.WriteLine("ERR|hook " + Marshal.GetLastWin32Error()); Console.Out.Flush(); return; }
        Console.Out.WriteLine("READY"); Console.Out.Flush();
        MSG m;
        while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) { }
    }
}
"@

[SkyHook]::Run($Keys)
