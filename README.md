# Microflix

Catálogo pessoal de vídeos educativos e de diversão, montado só com fontes oficiais e abertas: canais oficiais no YouTube, curtas no Vimeo e filmes livres da Wikimedia Commons (Blender Studio, Georges Méliès).

Endereço: https://jeandsprestes.github.io/microflix/

## Como funciona

- É uma página só (`index.html`, `app.js`, `estilo.css`), e o catálogo está em `catalogo.json`.
- O que foi assistido, a Minha lista e o ponto onde o vídeo parou ficam guardados no navegador de quem assiste.
- Os canais aprovados mostram os vídeos longos mais recentes, que estão em `canais.json`. Para atualizar a lista: `python ferramentas/atualizar_canais.py`.
- Para usar no próprio PC com Windows: `Abrir Microflix.cmd` liga um servidor local (`servidor.ps1`) e abre o Chrome em modo aplicativo.

## Direitos

Nenhum vídeo está guardado neste repositório. O Microflix toca cada vídeo no player do site onde ele foi publicado, pelo dono dos direitos ou sob licença livre (domínio público ou Creative Commons).
