<#
.SYNOPSIS
    Verifica se os modelos priorizados respondem pelo gateway compatível com OpenAI.

.DESCRIPTION
    Lista os modelos expostos pelo gateway e envia a cada modelo um pedido curto que exige JSON.
    A chave é lida de IA_CHAVE_API e nunca é exibida. Cada modelo consome uma chamada da cota.

.EXAMPLE
    $env:IA_CHAVE_API = '<chave unificada copiada do painel>'
    ./scripts/testar-modelos-ia.ps1 -Modelos claude-opus-5,claude-sonnet-4-6
#>
param(
    [string[]] $Modelos = @('claude-opus-5', 'claude-sonnet-4-6'),
    [string] $UrlBase = $(if ($env:IA_URL_BASE) { $env:IA_URL_BASE } else { 'http://127.0.0.1:3001/v1' })
)

$ErrorActionPreference = 'Stop'
if (-not $env:IA_CHAVE_API) {
    throw 'Defina IA_CHAVE_API com a chave unificada do gateway antes de executar.'
}

$cabecalhos = @{ Authorization = "Bearer $($env:IA_CHAVE_API)" }

Write-Host "Modelos expostos por $UrlBase/models:"
try {
    $catalogo = Invoke-RestMethod -Uri "$UrlBase/models" -Headers $cabecalhos -TimeoutSec 20
    $ids = @($catalogo.data | ForEach-Object { $_.id })
    $ids | Where-Object { $_ -match 'claude|opus|sonnet' } | ForEach-Object { Write-Host "  $_" }
    foreach ($modelo in $Modelos) {
        if ($ids -notcontains $modelo) {
            Write-Warning "O id '$modelo' nao aparece no catalogo; confira o nome exato acima."
        }
    }
} catch {
    Write-Warning "Nao foi possivel listar modelos: $($_.Exception.Message)"
}

$pedido = @'
Caso ficticio: mulher, 58 anos, dor toracica em aperto ha 40 minutos, sudorese, PA 150x90.
Responda SOMENTE com JSON no formato
{"hipotesePrincipal":"...","pergunta":"...","alternativas":["A","B","C","D"],"indiceCorreto":0}
'@

foreach ($modelo in $Modelos) {
    $corpo = @{
        model       = $modelo
        temperature = 0.2
        max_tokens  = 600
        messages    = @(
            @{ role = 'system'; content = 'Voce cria material educacional ficticio para professores de medicina.' },
            @{ role = 'user'; content = $pedido }
        )
    } | ConvertTo-Json -Depth 5

    $inicio = Get-Date
    try {
        $resposta = Invoke-RestMethod -Method Post -Uri "$UrlBase/chat/completions" -Headers $cabecalhos `
            -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($corpo)) -TimeoutSec 120
        $segundos = [math]::Round(((Get-Date) - $inicio).TotalSeconds, 1)
        $texto = $resposta.choices[0].message.content -replace '(?s)^```(json)?\s*|\s*```$', ''
        $jsonValido = $true
        try { $null = $texto | ConvertFrom-Json } catch { $jsonValido = $false }
        Write-Host ("[OK]   pedido={0} efetivo={1} tempo={2}s tokens={3}/{4} jsonValido={5}" -f `
            $modelo, $resposta.model, $segundos, $resposta.usage.prompt_tokens, $resposta.usage.completion_tokens, $jsonValido)
    } catch {
        $segundos = [math]::Round(((Get-Date) - $inicio).TotalSeconds, 1)
        $status = $_.Exception.Response.StatusCode.value__
        Write-Host ("[FALHA] pedido={0} status={1} tempo={2}s erro={3}" -f $modelo, $status, $segundos, $_.Exception.Message)
    }
}
