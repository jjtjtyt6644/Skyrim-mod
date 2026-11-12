# Dovah Trainer input bridge.
# Long-running helper: reads commands from stdin, focuses SkyrimSE.exe and
# types into the in-game console using hardware scan codes (SendInput +
# KEYEVENTF_SCANCODE), which DirectInput games like Skyrim actually receive.
#
# Protocol (one line each way):
#   STATUS                                         -> STATUS:1 | STATUS:0
#   RUN|<batName>|<consoleScan>|<delay>|<returnHwnd> -> OK | ERR:<message>
#        returnHwnd = window to give focus back to afterwards (0 = stay in game)
#   FOCUSGAME                                      -> OK | ERR:<message>
#   FOCUS|<hwnd>                                   -> OK | ERR:<message>
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

public static class SkyKeys {
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)]   struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion u; }

    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();

    const uint INPUT_KEYBOARD = 1, KEYEVENTF_KEYUP = 0x2, KEYEVENTF_SCANCODE = 0x8;

    static void Key(ushort scan, bool up) {
        var i = new INPUT[1];
        i[0].type = INPUT_KEYBOARD;
        i[0].u.ki.wScan = scan;
        i[0].u.ki.dwFlags = KEYEVENTF_SCANCODE | (up ? KEYEVENTF_KEYUP : 0);
        SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
    }

    public static void Tap(ushort scan, int hold) { Key(scan, false); Thread.Sleep(hold); Key(scan, true); Thread.Sleep(hold); }

    // DirectInput scan codes (US layout) for the characters we need to type.
    static ushort ScanFor(char c) {
        const string row1 = "qwertyuiop", row2 = "asdfghjkl", row3 = "zxcvbnm";
        c = Char.ToLowerInvariant(c);
        int k;
        if ((k = row1.IndexOf(c)) >= 0) return (ushort)(0x10 + k);
        if ((k = row2.IndexOf(c)) >= 0) return (ushort)(0x1E + k);
        if ((k = row3.IndexOf(c)) >= 0) return (ushort)(0x2C + k);
        if (c >= '1' && c <= '9') return (ushort)(0x02 + (c - '1'));
        if (c == '0') return 0x0B;
        if (c == ' ') return 0x39;
        throw new ArgumentException("Unsupported character: " + c);
    }

    public static IntPtr FindGame() {
        foreach (var p in Process.GetProcessesByName("SkyrimSE")) {
            if (p.MainWindowHandle != IntPtr.Zero) return p.MainWindowHandle;
        }
        return IntPtr.Zero;
    }

    // Foreground switch without injecting any keys into the game: attach to the
    // current foreground thread's input queue so Windows allows the change.
    public static bool Focus(IntPtr h) {
        if (h == IntPtr.Zero || !IsWindow(h)) return false;
        if (GetForegroundWindow() == h) return true;
        if (IsIconic(h)) ShowWindow(h, 9); // SW_RESTORE
        uint me = GetCurrentThreadId();
        uint fg = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
        uint target = GetWindowThreadProcessId(h, IntPtr.Zero);
        bool a1 = fg != me && AttachThreadInput(me, fg, true);
        bool a2 = target != me && target != fg && AttachThreadInput(me, target, true);
        BringWindowToTop(h);
        SetForegroundWindow(h);
        if (a2) AttachThreadInput(me, target, false);
        if (a1) AttachThreadInput(me, fg, false);
        for (int i = 0; i < 20; i++) { if (GetForegroundWindow() == h) return true; Thread.Sleep(25); }
        return false;
    }

    public static string RunBat(string bat, ushort consoleScan, int delay, IntPtr returnTo) {
        IntPtr h = FindGame();
        if (h == IntPtr.Zero) return "ERR:Skyrim SE is not running";
        if (!Focus(h)) return "ERR:Could not focus the Skyrim window";
        Thread.Sleep(delay * 3);
        // Release modifiers still held from a Ctrl+F-key hotkey so they don't mangle typing.
        Key(0x1D, true); Key(0x2A, true); Key(0x38, true);
        Thread.Sleep(delay);
        Tap(consoleScan, delay);           // open console
        Thread.Sleep(delay * 2);
        foreach (char c in "bat " + bat) Tap(ScanFor(c), 12);
        Tap(0x1C, delay);                  // Enter
        Thread.Sleep(delay * 3);
        Tap(consoleScan, delay);           // close console
        if (returnTo != IntPtr.Zero) { Thread.Sleep(delay); Focus(returnTo); }
        return "OK";
    }
}
"@

[Console]::Out.WriteLine('READY')
[Console]::Out.Flush()

while ($null -ne ($line = [Console]::In.ReadLine())) {
    try {
        $parts = $line.Trim().Split('|')
        switch ($parts[0]) {
            'STATUS' {
                $out = if ([SkyKeys]::FindGame() -ne [IntPtr]::Zero) { 'STATUS:1' } else { 'STATUS:0' }
            }
            'RUN' {
                $ret = if ($parts.Length -gt 4) { [IntPtr][long]$parts[4] } else { [IntPtr]::Zero }
                $out = [SkyKeys]::RunBat($parts[1], [uint16]$parts[2], [int]$parts[3], $ret)
            }
            'FOCUSGAME' {
                $g = [SkyKeys]::FindGame()
                $out = if ($g -eq [IntPtr]::Zero) { 'ERR:Skyrim SE is not running' } elseif ([SkyKeys]::Focus($g)) { 'OK' } else { 'ERR:Could not focus Skyrim' }
            }
            'FOCUS' {
                $out = if ([SkyKeys]::Focus([IntPtr][long]$parts[1])) { 'OK' } else { 'ERR:Could not focus window' }
            }
            default { $out = 'ERR:Unknown command' }
        }
    } catch {
        $out = 'ERR:' + ($_.Exception.Message -replace '[\r\n]+', ' ')
    }
    [Console]::Out.WriteLine($out)
    [Console]::Out.Flush()
}
