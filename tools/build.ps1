# Crea dist/Griglie di valutazione.html: un unico file da aprire nel browser (Chrome, Edge, Firefox).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'src'
$dist = Join-Path $root 'dist'
$out = Join-Path $dist 'Griglie di valutazione.html'
New-Item -ItemType Directory -Force $dist | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)

$htmlText = [IO.File]::ReadAllText((Join-Path $src 'index.html'), $utf8)

$htmlText = [regex]::Replace($htmlText, '<link rel="stylesheet" href="([^"]+)">', {
  param($m)
  $css = [IO.File]::ReadAllText((Join-Path $src $m.Groups[1].Value), $utf8)
  "<style>`n$css`n</style>"
})

# Tutti gli script locali diventano UN solo script chiuso in una funzione:
# nessun nome dell'app finisce tra le variabili globali della pagina.
$localScript = '\s*<script src="(?!https?:)([^"]+)"></script>'
$parts = foreach ($m in [regex]::Matches($htmlText, $localScript)) {
  $name = $m.Groups[1].Value
  $js = [IO.File]::ReadAllText((Join-Path $src $name), $utf8)
  if ($js -match '</script') { throw "Il file $name contiene '</script': non inlineabile" }
  "// ---- $name ----`n$js"
}
$bundle = "`n  <script>`n(function () {`n'use strict';`n" + ($parts -join "`n") +
  "`n// per il debug dalla console del browser`nwindow.GV = { S: S, U: U, Model: Model, Calc: Calc, Grid: Grid, Summary: Summary, Moodle: Moodle };`n})();`n</script>"
$first = $true
$htmlText = [regex]::Replace($htmlText, $localScript, {
  param($m)
  if ($script:first) { $script:first = $false; return $bundle }
  return ''
})

[IO.File]::WriteAllText($out, $htmlText, $utf8)
# copia per GitHub Pages (pubblicazione dalla cartella /docs del ramo main)
$docs = Join-Path $root 'docs'
New-Item -ItemType Directory -Force $docs | Out-Null
[IO.File]::WriteAllText((Join-Path $docs 'index.html'), $htmlText, $utf8)
$size = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Output "OK: dist/Griglie di valutazione.html e docs/index.html ($size KB)"
