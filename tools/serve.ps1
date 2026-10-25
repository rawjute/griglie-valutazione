# Piccolo server statico per provare l'app in locale: http://localhost:8765/
param([int]$Port = 8765)
$root = Split-Path -Parent $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Server su http://localhost:$Port/ (cartella $root)"
$types = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.csv' = 'text/csv; charset=utf-8' }
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  if ($ctx.Request.HttpMethod -eq 'POST' -and $path -like '__save/*') {
    # solo sviluppo: salva in out/ un file inviato dalla pagina (per controllare gli export)
    $name = [IO.Path]::GetFileName($path.Substring(7))
    $outDir = Join-Path $root 'out'
    New-Item -ItemType Directory -Force $outDir | Out-Null
    $fs = [IO.File]::Create((Join-Path $outDir $name))
    $ctx.Request.InputStream.CopyTo($fs); $fs.Close()
    $ctx.Response.Close()
    continue
  }
  if ($path -eq '') { $path = 'src/index.html' }
  $file = [IO.Path]::GetFullPath((Join-Path $root $path))
  if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($file)
    $ext = [IO.Path]::GetExtension($file).ToLower()
    $ctx.Response.ContentType = $(if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' })
    $ctx.Response.Headers.Add('Cache-Control', 'no-store')
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.Close()
}
