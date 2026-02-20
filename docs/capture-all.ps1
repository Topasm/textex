# capture-all.ps1 — Capture the TextEx Electron window as a PNG screenshot.
# Uses PrintWindow API to render the window itself (no desktop wallpaper bleed).
#
# Usage: powershell.exe -NoProfile -ExecutionPolicy Bypass -File docs/capture-all.ps1 [-Name <filename>]

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
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

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

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);

    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    private const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;

    public static IntPtr FindTextExWindow() {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            if (!IsWindowVisible(hWnd)) return true;
            var sb = new System.Text.StringBuilder(256);
            GetWindowText(hWnd, sb, 256);
            string title = sb.ToString();
            if (title.Contains("TextEx") || title.Contains("textex")) {
                found = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static Bitmap CaptureWindow(IntPtr hWnd) {
        // Use DWM extended frame bounds for accurate size (excludes invisible border)
        RECT rect;
        int hr = DwmGetWindowAttribute(hWnd, DWMWA_EXTENDED_FRAME_BOUNDS,
            out rect, Marshal.SizeOf(typeof(RECT)));
        if (hr != 0) {
            GetWindowRect(hWnd, out rect);
        }

        int width = rect.Right - rect.Left;
        int height = rect.Bottom - rect.Top;
        if (width <= 0 || height <= 0) return null;

        // PrintWindow renders the window itself — no wallpaper bleed
        Bitmap bmp = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(bmp)) {
            g.Clear(Color.White); // white background behind any transparent edges
            IntPtr hdc = g.GetHdc();
            // PW_RENDERFULLCONTENT = 2  (works with DWM / hardware-accelerated windows)
            PrintWindow(hWnd, hdc, 2);
            g.ReleaseHdc(hdc);
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

# Bring window to front and let it settle
[WindowCapture]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 500

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
