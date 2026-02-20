# capture-all.ps1 — Capture the TextEx Electron window as a PNG screenshot.
# Usage: powershell.exe -NoProfile -ExecutionPolicy Bypass -File docs/capture-all.ps1 [-Name <filename>]
#
# If -Name is omitted the file is saved as docs/images/screenshot.png.

param(
    [string]$Name = "screenshot"
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Drawing.Imaging;

public class WindowCapture {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public static IntPtr FindTextExWindow() {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            if (!IsWindowVisible(hWnd)) return true;
            var sb = new System.Text.StringBuilder(256);
            GetWindowText(hWnd, sb, 256);
            string title = sb.ToString();
            if (title.Contains("TextEx") || title.Contains("textex")) {
                found = hWnd;
                return false; // stop
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static Bitmap CaptureWindow(IntPtr hWnd) {
        RECT rect;
        GetWindowRect(hWnd, out rect);
        int width = rect.Right - rect.Left;
        int height = rect.Bottom - rect.Top;
        if (width <= 0 || height <= 0) return null;
        Bitmap bmp = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(bmp)) {
            g.CopyFromScreen(rect.Left, rect.Top, 0, 0, new Size(width, height));
        }
        return bmp;
    }
}
"@ -ReferencedAssemblies System.Drawing

$imagesDir = Join-Path $PSScriptRoot "images"
if (-not (Test-Path $imagesDir)) {
    New-Item -ItemType Directory -Path $imagesDir -Force | Out-Null
}

$outPath = Join-Path $imagesDir "$Name.png"

# Find the TextEx window
$hwnd = [WindowCapture]::FindTextExWindow()
if ($hwnd -eq [IntPtr]::Zero) {
    Write-Error "Could not find the TextEx window. Make sure the app is running."
    exit 1
}

# Brief pause to let the window settle
Start-Sleep -Milliseconds 300

# Capture
$bmp = [WindowCapture]::CaptureWindow($hwnd)
if ($null -eq $bmp) {
    Write-Error "Failed to capture window — zero-size rectangle."
    exit 1
}

$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

$size = (Get-Item $outPath).Length
$sizeKB = [math]::Round($size / 1024, 1)
Write-Host "Saved $outPath ($sizeKB KB)"
