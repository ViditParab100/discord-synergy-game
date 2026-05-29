# tools/convert_portraits.ps1
#
# Crops every image in /raw_character_designs to the card's 5:8 aspect (top-
# aligned, horizontally centered — keeps the head) and writes a 500x800 PNG
# into /client/assets/portraits with the same base name.
#
# Drop new raw art into /raw_character_designs and re-run this script:
#   pwsh tools/convert_portraits.ps1
# Filename must match the charId in shared/dictionary.js exactly (e.g.
# Star_Vader.jfif -> Star_Vader.png).
#
# Target dimensions:
#   - Card is 50x80 in-game (5:8 aspect)
#   - Source crop is 5:8 of the input image (top-aligned)
#   - Output is 200x400... wait — see below.
#
# Why 200x320 specifically:
#   The card displays at 50x80 in canvas-local pixels. At default browser
#   zoom on a 1080p monitor the canvas renders 1:1, so the card shows at
#   roughly 50x80 on screen. Retina/HiDPI roughly doubles that → 100x160 on
#   screen. Sourcing at 200x320 gives Phaser only a 4x downsample to do at
#   draw time, which its default bilinear filter handles cleanly. Going
#   higher (we tried 500x800) compresses to mush — bilinear can't preserve
#   fine details across 10x downsampling, and the result looks pixelated.

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
$src = Join-Path $root "raw_character_designs"
$dst = Join-Path $root "client\assets\portraits"

if (-not (Test-Path $src)) { throw "Source folder not found: $src" }
if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Path $dst | Out-Null }

$targetW = 200
$targetH = 320
$ratio   = $targetW / $targetH   # 0.625

$exts = @('.jfif', '.jpg', '.jpeg', '.png', '.webp')
Get-ChildItem $src -File | Where-Object { $exts -contains $_.Extension.ToLower() } | ForEach-Object {
    $img = [System.Drawing.Image]::FromFile($_.FullName)
    $w = $img.Width
    $h = $img.Height

    # Crop to the card's aspect ratio, top-aligned, horizontally centered.
    #   - If the source is wider than 5:8, we crop the sides.
    #   - If the source is taller than 5:8, we crop the BOTTOM (drop legs).
    if (($w / $h) -gt $ratio) {
        # source too wide: keep full height, narrow the width
        $cropH = $h
        $cropW = [int]([Math]::Round($h * $ratio))
        $cropX = [int](($w - $cropW) / 2)
        $cropY = 0
    } else {
        # source too tall: keep full width, shorten the height (top-aligned)
        $cropW = $w
        $cropH = [int]([Math]::Round($w / $ratio))
        $cropX = 0
        $cropY = 0
    }

    $bmp = New-Object System.Drawing.Bitmap($targetW, $targetH)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $srcRect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)
    $dstRect = New-Object System.Drawing.Rectangle(0, 0, $targetW, $targetH)
    $g.DrawImage($img, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

    $name = [IO.Path]::GetFileNameWithoutExtension($_.Name)
    $outPath = Join-Path $dst "$name.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $g.Dispose(); $bmp.Dispose(); $img.Dispose()
    Write-Output "$($_.Name)  ->  $name.png  (src ${w}x${h}, crop ${cropW}x${cropH}, out ${targetW}x${targetH})"
}
