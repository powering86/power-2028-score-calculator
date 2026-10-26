param([int]$Port = 8768)
$siteRoot = Join-Path $PSScriptRoot 'dist'
Write-Host "POWER 2028 preview: http://127.0.0.1:$Port/"
python -m http.server $Port --bind 127.0.0.1 --directory $siteRoot
