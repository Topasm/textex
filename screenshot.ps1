Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
}
public struct RECT {
    public int Left, Top, Right, Bottom;
}
"@

$proc = Get-Process | Where-Object { $_.MainWindowTitle -like "*TextEx*" -or $_.MainWindowTitle -like "*textex*" } | Select-Object -First 1
if ($proc) {
    [Win32]::SetForegroundWindow($proc.MainWindowHandle)
    Start-Sleep -Milliseconds 500

    $rect = New-Object RECT
    [Win32]::GetWindowRect($proc.MainWindowHandle, [ref]$rect)

    # Capture just the top 60px of the window
    $width = $rect.Right - $rect.Left
    $captureHeight = 60
    $bitmap = New-Object System.Drawing.Bitmap($width, $captureHeight)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $srcPoint = New-Object System.Drawing.Point($rect.Left, $rect.Top)
    $dstPoint = [System.Drawing.Point]::Empty
    $size = New-Object System.Drawing.Size($width, $captureHeight)
    $graphics.CopyFromScreen($srcPoint, $dstPoint, $size)
    $bitmap.Save("C:\Users\dhkdw\Desktop\project\textex\topbar.png")
    $graphics.Dispose()
    $bitmap.Dispose()
    Write-Host "Captured top bar: ${width}x${captureHeight} from ($($rect.Left),$($rect.Top))"
}
