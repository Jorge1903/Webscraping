# Reproducible vector drawing for the Android launcher icon; no external assets.
Add-Type -AssemblyName System.Drawing
$assetsPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../assets'))
foreach ($variant in @('icon', 'adaptive')) {
    $bitmap = New-Object System.Drawing.Bitmap 1024, 1024
    $drawing = [System.Drawing.Graphics]::FromImage($bitmap)
    $drawing.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    if ($variant -eq 'icon') { $drawing.Clear([System.Drawing.ColorTranslator]::FromHtml('#0b111b')) }
    else { $drawing.Clear([System.Drawing.Color]::Transparent) }
    $mint = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#5eead4')), 28
    $mint.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $mint.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $drawing.DrawEllipse($mint, 252, 252, 520, 520)
    $points = [System.Drawing.Point[]]@(
        (New-Object System.Drawing.Point 322, 536),
        (New-Object System.Drawing.Point 410, 536),
        (New-Object System.Drawing.Point 462, 420),
        (New-Object System.Drawing.Point 542, 620),
        (New-Object System.Drawing.Point 602, 492),
        (New-Object System.Drawing.Point 702, 492)
    )
    $drawing.DrawLines($mint, $points)
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#f1f5f9'))
    $drawing.FillEllipse($brush, 678, 468, 48, 48)
    $bitmap.Save((Join-Path $assetsPath "monitor-$variant.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $brush.Dispose()
    $mint.Dispose()
    $drawing.Dispose()
    $bitmap.Dispose()
}
