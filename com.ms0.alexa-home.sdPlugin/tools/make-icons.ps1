Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$icons = Join-Path $root "static\icons"
New-Item -ItemType Directory -Force -Path $icons | Out-Null

function Convert-HexColor([string]$hex) {
    return [System.Drawing.ColorTranslator]::FromHtml($hex)
}

function Save-Icon([string]$name, [string]$background, [string]$foreground, [string]$kind) {
    $bitmap = New-Object System.Drawing.Bitmap 144, 144
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear((Convert-HexColor $background))
    $color = Convert-HexColor $foreground
    $pen = New-Object System.Drawing.Pen $color, 8
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $brush = New-Object System.Drawing.SolidBrush $color

    switch ($kind) {
        "home" {
            $roof = @(
                (New-Object System.Drawing.Point 72, 28),
                (New-Object System.Drawing.Point 28, 68),
                (New-Object System.Drawing.Point 116, 68)
            )
            $graphics.FillPolygon($brush, $roof)
            $graphics.FillRectangle($brush, 40, 66, 64, 46)
            $cut = New-Object System.Drawing.SolidBrush (Convert-HexColor $background)
            $graphics.FillRectangle($cut, 62, 82, 20, 30)
            $cut.Dispose()
        }
        "power" {
            $graphics.DrawArc($pen, 42, 36, 60, 60, 135, 270)
            $graphics.DrawLine($pen, 72, 28, 72, 66)
        }
        "power-off" {
            $graphics.DrawEllipse($pen, 40, 40, 64, 64)
        }
        "rotate" {
            $arrow = New-Object System.Drawing.Drawing2D.AdjustableArrowCap 5, 7
            $pen.CustomEndCap = $arrow
            $graphics.DrawArc($pen, 38, 38, 68, 68, 40, 280)
            $arrow.Dispose()
        }
        "heat-high" {
            $graphics.DrawArc($pen, 34, 78, 28, 28, 200, 140)
            $graphics.DrawArc($pen, 58, 62, 28, 28, 200, 140)
            $graphics.DrawArc($pen, 82, 46, 28, 28, 200, 140)
        }
        "heat-low" {
            $graphics.DrawArc($pen, 50, 62, 44, 36, 200, 140)
        }
        "fan" {
            $graphics.FillEllipse($brush, 62, 62, 20, 20)
            $graphics.DrawLine($pen, 72, 72, 72, 34)
            $graphics.DrawLine($pen, 72, 72, 104, 92)
            $graphics.DrawLine($pen, 72, 72, 40, 92)
        }
        "bulb" {
            $graphics.FillEllipse($brush, 46, 24, 52, 52)
            $graphics.FillRectangle($brush, 60, 74, 24, 18)
            $graphics.FillRectangle($brush, 54, 96, 36, 10)
        }
        "bulb-off" {
            $graphics.DrawEllipse($pen, 46, 24, 52, 52)
            $graphics.DrawRectangle($pen, 60, 76, 24, 16)
            $graphics.DrawLine($pen, 54, 102, 90, 102)
        }
    }

    $path = Join-Path $icons "$name.png"
    if ($name -eq "icon") { $path = Join-Path $root "static\icon.png" }
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $pen.Dispose()
    $brush.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

Save-Icon "icon" "#12343A" "#7DDFC3" "home"
Save-Icon "heater-on" "#C65A12" "#FFF4E8" "power"
Save-Icon "heater-off" "#3A4148" "#D5D8DC" "power-off"
Save-Icon "heater-rotate" "#C65A12" "#FFF4E8" "rotate"
Save-Icon "heater-high" "#A33B24" "#FFE8DC" "heat-high"
Save-Icon "heater-low" "#C9842A" "#FFF6E8" "heat-low"
Save-Icon "heater-fan" "#2E6B8A" "#E7F6FF" "fan"
Save-Icon "lights-off" "#2C3138" "#C5CAD1" "bulb-off"
Save-Icon "lights-on" "#E6B325" "#3A2A08" "bulb"
Save-Icon "lights-10" "#6B5A28" "#F3E6C4" "bulb"
Save-Icon "lights-50" "#C4922A" "#FFF4D6" "bulb"
Save-Icon "lights-100" "#FFE08A" "#3A2A08" "bulb"
Save-Icon "lights-blue" "#1B6FD4" "#F3F8FF" "bulb"
Save-Icon "lights-red" "#C4382F" "#FFF4F2" "bulb"
Save-Icon "lights-white" "#F4F4F4" "#2A2A2A" "bulb"
Write-Output "icons ok"
