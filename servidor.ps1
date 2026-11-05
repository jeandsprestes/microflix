# Microflix: servidor local.
# Serve esta pasta em http://localhost:47123 e abre o Chrome em modo aplicativo (sem barra de endereço).
# Sem Chrome, abre no Edge. Para abrir sempre no Edge: acrescente -Navegador edge no Abrir Microflix.cmd.
# Desliga sozinho depois de 20 minutos sem uso (a página avisa que está aberta a cada minuto).
param(
  [int]$Porta = 47123,
  [string]$Raiz = $PSScriptRoot,
  [switch]$SemNavegador,
  [int]$MinutosOcioso = 20,
  [ValidateSet('chrome', 'edge')][string]$Navegador = 'chrome'
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$Raiz = (Resolve-Path -LiteralPath $Raiz).Path.TrimEnd('\')
$Endereco = "http://localhost:$Porta/"

function Abrir-Navegador {
  if ($SemNavegador) { return }
  $chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  $edge = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if ($Navegador -eq 'edge' -and $edge) { $chrome = $null }
  if ($chrome) { Start-Process -FilePath $chrome -ArgumentList "--app=$Endereco" }
  elseif ($edge) { Start-Process -FilePath $edge -ArgumentList "--app=$Endereco" }
  else { Start-Process $Endereco }
}

# Se o Microflix já está rodando, só abre a janela de novo.
try {
  $r = Invoke-WebRequest -Uri ($Endereco + 'api/ping') -UseBasicParsing -TimeoutSec 2
  if ($r.StatusCode -eq 200) { Abrir-Navegador; exit 0 }
} catch {}

$ouvinte = New-Object System.Net.HttpListener
$ouvinte.Prefixes.Add($Endereco)
try { $ouvinte.Start() } catch {
  Write-Host "Nao consegui abrir a porta $Porta. Outro programa pode estar usando."
  exit 1
}
Abrir-Navegador

# Só estes tipos de arquivo saem do servidor (a página e as imagens). Scripts e textos da pasta, não.
$tipos = @{
  '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'
  '.json'='application/json; charset=utf-8'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'
  '.webp'='image/webp'; '.svg'='image/svg+xml'; '.ico'='image/x-icon'; '.vtt'='text/vtt; charset=utf-8'
  '.woff2'='font/woff2'
}

# Canais aprovados: só os canais do catalogo.json (itens do tipo "canal") podem ser consultados.
function Canais-Aprovados {
  $arq = Join-Path $Raiz 'catalogo.json'
  if (-not (Test-Path -LiteralPath $arq)) { return @() }
  try {
    $dados = [IO.File]::ReadAllText($arq, [Text.Encoding]::UTF8) | ConvertFrom-Json
    @($dados.itens | Where-Object { $_.tipo -eq 'canal' -and $_.canalId } | ForEach-Object { [string]$_.canalId })
  } catch { @() }
}

function Responder($ctx, [int]$status, [byte[]]$corpo, [string]$tipo) {
  $res = $ctx.Response
  $res.StatusCode = $status
  $res.ContentType = $tipo
  $res.Headers['Cache-Control'] = 'no-cache'
  $res.ContentLength64 = $corpo.Length
  $res.OutputStream.Write($corpo, 0, $corpo.Length)
  $res.OutputStream.Close()
}
function Texto([string]$s) { [Text.Encoding]::UTF8.GetBytes($s) }

# Busca o feed do YouTube com limite de 10 s, repassando os bytes como vieram.
function Baixar([string]$url) {
  $req = [Net.HttpWebRequest]::Create($url)
  $req.Timeout = 10000
  $req.ReadWriteTimeout = 10000
  $req.UserAgent = 'Microflix'
  $resp = $req.GetResponse()
  try {
    $ms = New-Object IO.MemoryStream
    $resp.GetResponseStream().CopyTo($ms)
    return ,$ms.ToArray()
  } finally { $resp.Close() }
}

$ultimo = Get-Date
$volta = Get-Date
while ($ouvinte.IsListening) {
  $pedido = $ouvinte.BeginGetContext($null, $null)
  while (-not $pedido.AsyncWaitHandle.WaitOne(1000)) {
    $agora = Get-Date
    # Um salto de mais de 2 minutos entre duas voltas quer dizer que o PC dormiu: recomeça a contagem.
    if (($agora - $volta).TotalMinutes -gt 2) { $ultimo = $agora }
    $volta = $agora
    if ($MinutosOcioso -gt 0 -and ($agora - $ultimo).TotalMinutes -ge $MinutosOcioso) { $ouvinte.Stop(); exit 0 }
  }
  $ctx = $null
  try {
    $ctx = $ouvinte.EndGetContext($pedido)
    $ultimo = Get-Date
    $volta = $ultimo
    $caminho = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($caminho -eq '/api/ping') { Responder $ctx 200 (Texto 'ok') 'text/plain'; continue }
    if ($caminho -eq '/api/canal') {
      $id = $ctx.Request.QueryString['id']
      if (-not $id -or -not ((Canais-Aprovados) -contains $id)) {
        Responder $ctx 403 (Texto 'canal fora da lista') 'text/plain; charset=utf-8'; continue
      }
      # UULF = só os vídeos longos do canal (sem Shorts e sem lives)
      $lista = 'UULF' + $id.Substring(2)
      try { $xml = Baixar "https://www.youtube.com/feeds/videos.xml?playlist_id=$lista" }
      catch { Responder $ctx 502 (Texto 'o YouTube nao respondeu') 'text/plain; charset=utf-8'; continue }
      Responder $ctx 200 $xml 'application/xml; charset=utf-8'; continue
    }
    if ($caminho -eq '/api/autor') {
      # De que canal é este vídeo? (serviço oEmbed do YouTube). Usado pela trava de sugestões do player.
      $v = $ctx.Request.QueryString['v']
      if (-not $v -or $v -notmatch '^[A-Za-z0-9_-]{11}$') { Responder $ctx 400 (Texto 'id invalido') 'text/plain'; continue }
      $alvo = 'https://www.youtube.com/oembed?format=json&url=' + [Uri]::EscapeDataString("https://www.youtube.com/watch?v=$v")
      try { $json = Baixar $alvo }
      catch { Responder $ctx 502 (Texto 'o YouTube nao respondeu') 'text/plain; charset=utf-8'; continue }
      Responder $ctx 200 $json 'application/json; charset=utf-8'; continue
    }
    if ($caminho -eq '/') { $caminho = '/index.html' }
    $arquivo = [IO.Path]::GetFullPath((Join-Path $Raiz $caminho.TrimStart('/')))
    $tipo = $tipos[[IO.Path]::GetExtension($arquivo).ToLower()]
    if (-not $tipo -or -not $arquivo.StartsWith($Raiz + '\', [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $arquivo -PathType Leaf)) {
      Responder $ctx 404 (Texto 'nao encontrado') 'text/plain; charset=utf-8'; continue
    }
    Responder $ctx 200 ([IO.File]::ReadAllBytes($arquivo)) $tipo
  } catch {
    # Um pedido com problema nunca derruba o servidor.
    if ($ctx) { try { Responder $ctx 500 (Texto 'erro') 'text/plain' } catch {} }
  }
}
