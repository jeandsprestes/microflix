'use strict';
/* Microflix: catálogo pessoal de vídeos.
   O catálogo vem de catalogo.json. A memória (assistidos, progresso e Minha lista) fica guardada no Chrome deste PC. */

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const semAcento = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let CAT = { itens: [], fileiras: [] };
let porId = new Map();
const estado = { vista: 'inicio', busca: '' };
const cacheCanal = new Map();

/* ---------- memória ---------- */
const CHAVE = 'microflix.v1';
const mem = (() => {
  try {
    const m = JSON.parse(localStorage.getItem(CHAVE) || '{}');
    return { assistidos: m.assistidos || {}, progresso: m.progresso || {}, lista: m.lista || [] };
  } catch (e) { return { assistidos: {}, progresso: {}, lista: [] }; }
})();
function salvar() { try { localStorage.setItem(CHAVE, JSON.stringify(mem)); } catch (e) { /* sem memória: segue funcionando */ } }

function chave(pl) {
  if (!pl) return '';
  if (pl.tipo === 'youtube') return 'yt:' + pl.id;
  if (pl.tipo === 'vimeo') return 'vm:' + pl.id;
  if (pl.tipo === 'mp4') return 'mp4:' + pl.src;
  return '';
}
const foiAssistido = k => !!(k && mem.assistidos[k]);
function marcar(k, sim = true) {
  if (!k) return;
  if (sim) { mem.assistidos[k] = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10); delete mem.progresso[k]; }
  else delete mem.assistidos[k];
  salvar();
}
function fracao(k) { const p = mem.progresso[k]; return p && p.d ? Math.min(1, p.t / p.d) : 0; }

/* ---------- itens ---------- */
function videos(item) {
  if (item.episodios && item.episodios.length) {
    return item.episodios.map((ep, i) => ({
      titulo: ep.titulo, n: i + 1, duracaoMin: ep.duracaoMin,
      player: ep.youtubeId ? { tipo: 'youtube', id: ep.youtubeId }
        : ep.vimeoId ? { tipo: 'vimeo', id: ep.vimeoId }
          : { tipo: 'mp4', src: ep.src, legendaVtt: ep.legendaVtt },
    }));
  }
  if (item.player && ['youtube', 'vimeo', 'mp4'].includes(item.player.tipo)) {
    return [{ titulo: item.titulo, n: 1, duracaoMin: item.duracaoMin, player: item.player }];
  }
  return [];
}
function situacao(item) {
  const vs = videos(item);
  if (!vs.length) return { total: 0, vistos: 0, assistido: false, fr: 0 };
  const vistos = vs.filter(v => foiAssistido(chave(v.player))).length;
  return { total: vs.length, vistos, assistido: vistos === vs.length, fr: vs.length === 1 ? fracao(chave(vs[0].player)) : 0 };
}
function proximo(item) {
  const vs = videos(item);
  return vs.find(v => !foiAssistido(chave(v.player)) && fracao(chave(v.player)) > 0.02)
    || vs.find(v => !foiAssistido(chave(v.player))) || vs[0];
}
function ultimoUso(item) {
  return Math.max(0, ...videos(item).map(v => (mem.progresso[chave(v.player)] || {}).em || 0));
}
function emAndamento(item) {
  if (item.tipo === 'canal') return false;
  const s = situacao(item);
  if (s.assistido) return false;
  return s.vistos > 0 || videos(item).some(v => fracao(chave(v.player)) > 0.02);
}
const ordenar = arr => [...arr].sort((a, b) => situacao(a).assistido - situacao(b).assistido);

/* ---------- textos curtos ---------- */
function duracao(min) {
  if (!min) return '';
  const m = Math.max(1, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
function dataBR(iso) { const [a, m, d] = String(iso || '').split('-'); return a && m && d ? `${d}/${m}/${a}` : ''; }
const IDIOMA = { pt: 'Português', 'sem-fala': 'Sem falas', outro: 'Outro idioma' };
const IDIOMA_CURTO = { pt: 'PT', 'sem-fala': 'SEM FALAS' };
const temLegenda = item => !!(item.legendaPT || (item.player && item.player.legendaVtt));
function idiomaLongo(item) {
  if (item.idioma !== 'en') return IDIOMA[item.idioma] || '';
  if (!temLegenda(item)) return 'Inglês';
  return item.tipo === 'canal' ? 'Inglês, com legenda em português nos vídeos que têm' : 'Inglês com legenda em português';
}
const idiomaCurto = item => item.idioma === 'en' ? (temLegenda(item) ? 'LEG' : 'EN') : (IDIOMA_CURTO[item.idioma] || '');
const TIPO = { filme: 'Filme', curta: 'Curta', documentario: 'Documentário', serie: 'Série', video: 'Vídeo', canal: 'Canal' };
const ci = c => c ? `<b class="ci ci-${esc(c)}" title="Classificação: ${c === 'L' ? 'livre' : esc(c) + ' anos'}">${esc(c)}</b>` : '';
function tamanho(item) {
  if (item.tipo === 'canal') return 'Canal';
  if (item.episodios && item.episodios.length) return `${item.episodios.length} episódios`;
  return duracao(item.duracaoMin);
}
function metaCurta(item) {
  const chip = idiomaCurto(item) ? ` <span class="chip">${idiomaCurto(item)}</span>` : '';
  return `${ci(item.classificacao)} ${esc(tamanho(item))}${chip}`;
}
function metaLonga(item) {
  const partes = [];
  if (item.ano) partes.push(esc(item.ano));
  partes.push(esc(TIPO[item.tipo] || ''));
  if (tamanho(item) && item.tipo !== 'canal') partes.push(esc(tamanho(item)));
  partes.push(ci(item.classificacao));
  if (idiomaLongo(item)) partes.push(esc(idiomaLongo(item)));
  return partes.filter(Boolean).join(' · ');
}

/* ---------- capas ---------- */
function ytId(item) {
  if (item.player && item.player.tipo === 'youtube') return item.player.id;
  const ep = (item.episodios || []).find(e => e.youtubeId);
  return ep ? ep.youtubeId : '';
}
function imgCapa(item, grande, cls, imediata) {
  const id = ytId(item);
  const src = item.capa || (id ? `https://i.ytimg.com/vi/${id}/${grande ? 'maxresdefault' : 'mqdefault'}.jpg` : '');
  if (!src) return `<span class="${cls} sem-capa">${grande ? '' : esc(item.titulo)}</span>`;
  const reserva = id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
  return `<img class="${cls}" src="${esc(src)}" alt="" ${imediata ? '' : 'loading="lazy"'} ${reserva ? `data-reserva="${esc(reserva)}"` : ''}>`;
}
// Capa grande que não existe: o YouTube devolve erro ou uma imagem cinza de 120 px. Troca pela reserva.
function trocarCapa(im) { if (im.dataset.reserva && im.src !== im.dataset.reserva) im.src = im.dataset.reserva; }
document.addEventListener('error', e => { if (e.target.tagName === 'IMG') trocarCapa(e.target); }, true);
document.addEventListener('load', e => { const im = e.target; if (im.tagName === 'IMG' && im.naturalWidth && im.naturalWidth <= 120) trocarCapa(im); }, true);

/* ---------- peças da tela ---------- */
function cartao(item) {
  const s = situacao(item);
  let selo = '';
  if (item.tipo !== 'canal') {
    if (s.assistido) selo = '<span class="selo ok">✓ Assistido</span>';
    else if (s.total > 1 && s.vistos) selo = `<span class="selo">${s.vistos} de ${s.total}</span>`;
  }
  const barra = !s.assistido && s.fr > 0.02 ? `<span class="barra"><i style="width:${Math.round(s.fr * 100)}%"></i></span>` : '';
  return `<button type="button" class="cartao${s.assistido ? ' visto' : ''}" data-item="${esc(item.id)}">
    <span class="moldura">${imgCapa(item, false, 'capa')}${selo}${barra}</span>
    <span class="nome">${esc(item.titulo)}</span>
    <span class="meta">${metaCurta(item)}</span>
  </button>`;
}
function fileira(titulo, itens) {
  if (!itens.length) return '';
  return `<section class="fileira"><h2>${esc(titulo)}</h2><div class="trilho-moldura">
    <button type="button" class="seta esq" data-rolar="-1" aria-label="Voltar a fileira">‹</button>
    <div class="trilho">${itens.map(cartao).join('')}</div>
    <button type="button" class="seta dir" data-rolar="1" aria-label="Avançar a fileira">›</button>
  </div></section>`;
}
function grade(titulo, subtitulo, itens, vazio) {
  return `<section class="grade-sec"><h1 class="titulo-vista">${esc(titulo)}</h1>
    ${subtitulo ? `<p class="subtitulo-vista">${esc(subtitulo)}</p>` : ''}
    ${itens.length ? `<div class="grade">${itens.map(cartao).join('')}</div>` : `<p class="vazio">${esc(vazio)}</p>`}</section>`;
}
function escolherDestaque(arr) {
  if (!arr.length) return null;
  const dia = Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5);
  return arr[dia % arr.length];
}
function rotuloPlay(item) {
  const v = proximo(item);
  if (!v) return '▶ Assistir';
  const k = chave(v.player);
  const serie = item.episodios && item.episodios.length > 1;
  if (fracao(k) > 0.02 && !foiAssistido(k)) return serie ? `▶ Continuar episódio ${v.n}` : '▶ Continuar';
  return serie ? `▶ Assistir episódio ${v.n}` : '▶ Assistir';
}
function destaque(item) {
  if (!item) return '';
  return `<section class="destaque">
    ${imgCapa(item, true, 'destaque-fundo', true)}
    <div class="destaque-texto">
      <p class="destaque-tipo">${esc(TIPO[item.tipo] || '')}${item.fileira ? ' · ' + esc(item.fileira) : ''}</p>
      <h1>${esc(item.titulo)}</h1>
      <p class="meta">${metaLonga(item)}</p>
      <p class="destaque-desc">${esc(item.descricao)}</p>
      <div class="acoes">
        <button type="button" class="btn btn-play" data-tocar="${esc(item.id)}">${rotuloPlay(item)}</button>
        <button type="button" class="btn btn-sec" data-item="${esc(item.id)}">Mais informações</button>
      </div>
    </div>
  </section>`;
}

/* ---------- vistas ---------- */
function vistaInicio() {
  const conteudos = CAT.itens.filter(i => i.tipo !== 'canal');
  const canais = CAT.itens.filter(i => i.tipo === 'canal');
  const naoVistos = conteudos.filter(i => !situacao(i).assistido);
  const continuar = conteudos.filter(emAndamento).sort((a, b) => ultimoUso(b) - ultimoUso(a));
  const lista = mem.lista.map(id => porId.get(id)).filter(Boolean);
  const vistos = conteudos.filter(i => situacao(i).assistido);
  let html = destaque(escolherDestaque(naoVistos.length ? naoVistos : conteudos));
  html += fileira('Continuar assistindo', continuar);
  html += fileira('Minha lista', lista);
  for (const f of CAT.fileiras) html += fileira(f, ordenar(conteudos.filter(i => i.fileira === f)));
  html += fileira('Mais para ver', ordenar(conteudos.filter(i => !CAT.fileiras.includes(i.fileira))));
  html += fileira('Canais aprovados', canais);
  html += fileira('Já assisti', vistos);
  return html;
}
function vistaBusca() {
  const termos = semAcento(estado.busca).split(/\s+/).filter(Boolean);
  const achados = CAT.itens.filter(i => {
    const texto = semAcento([i.titulo, i.tituloOriginal, i.descricao, i.categoria, i.fileira, i.canal, TIPO[i.tipo]].join(' '));
    return termos.every(t => texto.includes(t));
  });
  return grade(`Busca: ${estado.busca}`, '', achados, 'Nada encontrado com essa busca.');
}
function render() {
  $$('.menu button').forEach(b => b.classList.toggle('ativo', b.dataset.ir === estado.vista));
  const c = $('#conteudo');
  if (estado.vista === 'busca') c.innerHTML = vistaBusca();
  else if (estado.vista === 'canais') c.innerHTML = grade('Canais aprovados', 'Dentro destes canais você pode escolher qualquer vídeo.', CAT.itens.filter(i => i.tipo === 'canal'), 'Nenhum canal aprovado ainda.');
  else if (estado.vista === 'lista') c.innerHTML = grade('Minha lista', '', mem.lista.map(id => porId.get(id)).filter(Boolean), 'Sua lista está vazia. Abra um título e toque em "+ Minha lista".');
  else if (estado.vista === 'assistidos') c.innerHTML = grade('Já assisti', '', CAT.itens.filter(i => i.tipo !== 'canal' && situacao(i).assistido), 'Quando você terminar um vídeo, ele aparece aqui.');
  else c.innerHTML = vistaInicio();
}
function ir(vista) {
  estado.vista = vista;
  if (vista !== 'busca') { estado.busca = ''; $('#busca').value = ''; }
  render();
  window.scrollTo(0, 0);
}

/* ---------- detalhe ---------- */
function htmlEpisodios(item) {
  return `<h3>Episódios</h3><ol class="episodios">${videos(item).map((v, i) => {
    const k = chave(v.player), visto = foiAssistido(k), fr = fracao(k);
    return `<li><button type="button" class="ep${visto ? ' visto' : ''}" data-ep="${esc(item.id)}|${i}">
      <span class="ep-n">${i + 1}</span><span class="ep-nome">${esc(v.titulo)}</span>
      <span class="ep-dur">${visto ? '✓ visto' : esc(duracao(v.duracaoMin))}</span>
      ${!visto && fr > 0.02 ? `<span class="barra"><i style="width:${Math.round(fr * 100)}%"></i></span>` : ''}
    </button></li>`;
  }).join('')}</ol>`;
}
function htmlDetalhe(item) {
  const s = situacao(item);
  const naLista = mem.lista.includes(item.id);
  const ehCanal = item.tipo === 'canal';
  const status = s.assistido ? ' · <span class="ok-txt">✓ Assistido</span>' : (s.total > 1 && s.vistos ? ` · ${s.vistos} de ${s.total} vistos` : '');
  return `<div class="detalhe-fundo" data-fechar></div>
  <article class="detalhe-caixa" role="dialog" aria-modal="true" aria-labelledby="dt-titulo" tabindex="-1">
    <div class="detalhe-capa">${imgCapa(item, true, 'detalhe-img', true)}
      <button type="button" class="fechar" data-fechar aria-label="Fechar">×</button>
      <div class="detalhe-topo">
        <h2 id="dt-titulo">${esc(item.titulo)}</h2>
        ${item.tituloOriginal && item.tituloOriginal !== item.titulo ? `<p class="original">${esc(item.tituloOriginal)}</p>` : ''}
        <div class="acoes">
          ${ehCanal ? '' : `<button type="button" class="btn btn-play" data-tocar="${esc(item.id)}">${rotuloPlay(item)}</button>`}
          <button type="button" class="btn btn-sec" data-lista="${esc(item.id)}">${naLista ? '✓ Na minha lista' : '+ Minha lista'}</button>
          ${ehCanal ? '' : `<button type="button" class="btn btn-sec" data-marcar="${esc(item.id)}">${s.assistido ? 'Desmarcar assistido' : 'Marcar como assistido'}</button>`}
        </div>
      </div>
    </div>
    <div class="detalhe-corpo">
      <p class="meta">${metaLonga(item)}${status}</p>
      <p class="desc">${esc(item.descricao)}</p>
      ${item.porQueAssistir ? `<p class="porque"><b>Por que assistir:</b> ${esc(item.porQueAssistir)}</p>` : ''}
      ${item.ressalva ? `<p class="aviso"><b>Bom saber:</b> ${esc(item.ressalva)}</p>` : ''}
      ${item.episodios && item.episodios.length > 1 ? htmlEpisodios(item) : ''}
      ${ehCanal ? `<h3>Vídeos do canal</h3><div id="canal-videos"><p class="carregando">Carregando os vídeos…</p></div>` : ''}
      <dl class="ficha">
        ${item.canal ? `<dt>${ehCanal ? 'Canal' : 'Publicado por'}</dt><dd>${esc(item.canal)}</dd>` : ''}
        ${item.plataforma ? `<dt>Onde está</dt><dd>${esc(item.plataforma)}</dd>` : ''}
        ${item.licenca ? `<dt>Direitos</dt><dd>${esc(item.licenca)}</dd>` : ''}
        <dt>Classificação</dt><dd>${ci(item.classificacao)} ${esc(item.motivoClassificacao || '')}</dd>
      </dl>
    </div>
  </article>`;
}
function abrirDetalhe(id) {
  const item = porId.get(id);
  if (!item) return;
  const d = $('#detalhe');
  d.dataset.item = id;
  d.innerHTML = htmlDetalhe(item);
  d.hidden = false;
  d.scrollTop = 0;
  document.body.classList.add('travado');
  $('.detalhe-caixa', d).focus({ preventScroll: true });
  if (item.tipo === 'canal') carregarCanal(item);
}
function atualizarDetalhe() {
  const d = $('#detalhe');
  if (d.hidden || !d.dataset.item) return;
  const item = porId.get(d.dataset.item);
  if (!item) return;
  const rolagem = d.scrollTop;
  d.innerHTML = htmlDetalhe(item);
  d.scrollTop = rolagem;
  if (item.tipo === 'canal') carregarCanal(item);
}
function fecharDetalhe() {
  const d = $('#detalhe');
  d.hidden = true; d.innerHTML = ''; delete d.dataset.item;
  if ($('#player').hidden) document.body.classList.remove('travado');
}

/* ---------- canais ---------- */
const NS_YT = 'http://www.youtube.com/xml/schemas/2015';
const NS_MEDIA = 'http://search.yahoo.com/mrss/';
// Última lista boa de cada canal, guardada para quando o YouTube não responder.
const CHAVE_CANAIS = 'microflix.canais';
function listaGuardada(canalId) {
  try { return (JSON.parse(localStorage.getItem(CHAVE_CANAIS) || '{}'))[canalId] || null; } catch (e) { return null; }
}
function guardarLista(canalId, vids) {
  try {
    const todas = JSON.parse(localStorage.getItem(CHAVE_CANAIS) || '{}');
    todas[canalId] = { em: Date.now(), vids };
    localStorage.setItem(CHAVE_CANAIS, JSON.stringify(todas));
  } catch (e) { /* sem memória: segue sem a reserva */ }
}
// No PC (servidor local), a lista vem ao vivo do YouTube. Online, ou se o YouTube não responder, vem do canais.json publicado junto.
let canaisPublicados = null;
async function listaPublicada(canalId) {
  if (!canaisPublicados) {
    const r = await fetch('canais.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    canaisPublicados = await r.json();
  }
  const vids = ((canaisPublicados && canaisPublicados.canais) || {})[canalId];
  if (!vids || !vids.length) throw new Error('canal sem lista publicada');
  return vids;
}
async function buscarCanal(canalId) {
  if (modoLocal) {
    try { return await buscarCanalAoVivo(canalId); } catch (e) { /* tenta a lista publicada */ }
  }
  return listaPublicada(canalId);
}
async function buscarCanalAoVivo(canalId) {
  const r = await fetch('api/canal?id=' + encodeURIComponent(canalId), { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const doc = new DOMParser().parseFromString(await r.text(), 'application/xml');
  const vids = [...doc.getElementsByTagName('entry')].map(e => ({
    id: (e.getElementsByTagNameNS(NS_YT, 'videoId')[0] || {}).textContent,
    titulo: (e.getElementsByTagName('title')[0] || {}).textContent || '',
    publicado: ((e.getElementsByTagName('published')[0] || {}).textContent || '').slice(0, 10),
  })).filter(v => v.id);
  if (!vids.length) throw new Error('lista vazia');
  return vids;
}
async function carregarCanal(item) {
  const alvo = $('#canal-videos');
  if (!alvo) return;
  let vids = cacheCanal.get(item.canalId);
  let aviso = '';
  if (!vids) {
    try {
      vids = await buscarCanal(item.canalId);
      cacheCanal.set(item.canalId, vids);
      guardarLista(item.canalId, vids);
      if (!modoLocal && canaisPublicados && canaisPublicados.atualizadoEm) {
        aviso = `<p class="vazio">Lista de vídeos de ${esc(dataBR(canaisPublicados.atualizadoEm))}.</p>`;
      }
    } catch (e) {
      const reserva = listaGuardada(item.canalId);
      if (reserva && reserva.vids && reserva.vids.length) {
        vids = reserva.vids;
        aviso = `<p class="vazio">O YouTube não respondeu agora. Esta é a lista de ${esc(new Date(reserva.em).toLocaleDateString('pt-BR'))}.</p>`;
      }
    }
  }
  const agora = $('#canal-videos');
  if (!agora) return;
  if (!vids) {
    agora.innerHTML = `<p class="vazio">Não consegui buscar os vídeos do canal agora.</p>
      <button type="button" class="btn btn-sec" data-recarregar="${esc(item.id)}">Tentar de novo</button>`;
    return;
  }
  agora.innerHTML = aviso + '<div class="canal-videos">' + vids.map(v => {
    const k = 'yt:' + v.id, visto = foiAssistido(k), fr = fracao(k);
    return `<button type="button" class="cv${visto ? ' visto' : ''}" data-cv="${esc(item.id)}|${esc(v.id)}" title="${esc(v.titulo)}">
      <span class="moldura"><img class="capa" src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy">
      ${visto ? '<span class="selo ok">✓</span>' : ''}${!visto && fr > 0.02 ? `<span class="barra"><i style="width:${Math.round(fr * 100)}%"></i></span>` : ''}</span>
      <span class="nome">${esc(v.titulo)}</span><span class="meta">${esc(dataBR(v.publicado))}</span>
    </button>`;
  }).join('') + '</div>';
}
// Vídeos de canais aprovados que o Microflix já conhece (das listas buscadas nesta sessão ou guardadas).
function videoDeCanalAprovado(vid) {
  const publicadas = (canaisPublicados && canaisPublicados.canais) || {};
  return CAT.itens.some(i => i.tipo === 'canal' && i.canalId &&
    [cacheCanal.get(i.canalId), (listaGuardada(i.canalId) || {}).vids, publicadas[i.canalId]]
      .some(lista => (lista || []).some(v => v.id === vid)));
}

/* ---------- player ---------- */
let tocando = null;
const kAtual = () => !tocando ? '' : tocando.tipo === 'youtube' && tocando.vid ? 'yt:' + tocando.vid : tocando.k;

function tocar(item, video) {
  if (!item || !video) return;
  pararPlayer();
  const pl = video.player;
  const k = chave(pl);
  const prog = mem.progresso[k];
  const inicio = prog && prog.d && prog.t / prog.d < 0.92 && prog.t > 20 && !foiAssistido(k) ? Math.floor(prog.t - 5) : 0;
  const leg = item.legendaPT || '';
  const box = $('#player');
  box.innerHTML = `<div class="player-topo">
      <button type="button" class="btn-voltar" data-fechar-player>← Voltar</button>
      <span class="player-titulo" id="player-titulo">${esc(video.titulo)}</span>
    </div>
    <div class="player-area" id="player-area"></div>
    <div class="player-fim" id="player-fim" hidden></div>`;
  box.hidden = false;
  document.body.classList.add('travado');
  tocando = { item, video, tipo: pl.tipo, k, vid: pl.tipo === 'youtube' ? pl.id : '', titulo: video.titulo, t: inicio, d: 0, fim: false, ouviu: false, timer: 0 };
  const area = $('#player-area');
  const trava = 'sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"';

  if (pl.tipo === 'youtube') {
    const p = new URLSearchParams({ autoplay: '1', rel: '0', iv_load_policy: '3', playsinline: '1', enablejsapi: '1', hl: 'pt-BR', origin: location.origin });
    // Legenda em português ligada desde o início (o YouTube pede o código de 2 letras).
    if (leg) { p.set('cc_load_policy', '1'); p.set('cc_lang_pref', 'pt'); }
    if (inicio) p.set('start', String(inicio));
    area.innerHTML = `<iframe id="quadro" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(pl.id || '')}?${p}" title="${esc(video.titulo)}" ${trava}></iframe>`;
    ligarYouTube($('#quadro'));
  } else if (pl.tipo === 'vimeo') {
    const p = new URLSearchParams({ autoplay: '1', dnt: '1' });
    if (leg) p.set('texttrack', leg);
    // O player do Vimeo só funciona com allow-forms; continua sem poder abrir janelas ou sair do Microflix.
    const travaVimeo = trava.replace('allow-presentation', 'allow-presentation allow-forms');
    area.innerHTML = `<iframe id="quadro" src="https://player.vimeo.com/video/${encodeURIComponent(pl.id)}?${p}${inicio ? `#t=${inicio}s` : ''}" title="${esc(video.titulo)}" ${travaVimeo}></iframe>`;
    ligarVimeo($('#quadro'));
  } else if (pl.tipo === 'mp4') {
    // crossorigin: a legenda vem de outro site (Wikimedia), que permite esse uso.
    area.innerHTML = `<video id="video" controls autoplay playsinline preload="metadata" ${pl.legendaVtt ? 'crossorigin="anonymous"' : ''} src="${esc(pl.src)}">
      ${pl.legendaVtt ? `<track kind="subtitles" srclang="pt" label="Português" src="${esc(pl.legendaVtt)}" default>` : ''}</video>`;
    const v = $('#video');
    let tentouLeve = false;
    v.addEventListener('loadedmetadata', () => { if (inicio) v.currentTime = inicio; tocando && (tocando.d = v.duration || 0); });
    v.addEventListener('timeupdate', () => { if (!tocando) return; tocando.t = v.currentTime; if (v.duration) tocando.d = v.duration; });
    v.addEventListener('ended', fimDoVideo);
    v.addEventListener('playing', esconderFim);
    v.addEventListener('error', () => {
      // Arquivo da Wikimedia em 1080p falhou: tenta uma vez a versão mais leve, em 480p.
      if (!tentouLeve && /\.1080p\.vp9\.webm$/.test(v.currentSrc || pl.src)) {
        tentouLeve = true;
        v.src = (v.currentSrc || pl.src).replace(/\.1080p\.vp9\.webm$/, '.480p.vp9.webm');
        return;
      }
      area.innerHTML = '<p class="player-erro">Este vídeo não abriu agora. A fonte pode estar fora do ar. Tente mais tarde.</p>';
    });
  }
  tocando.timer = setInterval(guardarProgresso, 5000);
}
function guardarProgresso() {
  if (!tocando || tocando.bloqueado || tocando.verificando) return;
  const k = kAtual();
  if (!k || foiAssistido(k) || !(tocando.d > 0) || !(tocando.t > 1)) return;
  if (tocando.t / tocando.d >= 0.92) { marcar(k); return; }
  mem.progresso[k] = { t: Math.round(tocando.t), d: Math.round(tocando.d), em: Date.now() };
  salvar();
}
function esconderFim() { if (tocando) tocando.fim = false; const f = $('#player-fim'); if (f) f.hidden = true; }
function proximoEpisodio() {
  if (!tocando || !tocando.item.episodios || tocando.item.episodios.length < 2) return null;
  const vs = videos(tocando.item);
  const atual = vs.findIndex(v => chave(v.player) === tocando.k);
  return atual >= 0 && atual < vs.length - 1 ? vs[atual + 1] : null;
}
function fimDoVideo() {
  if (!tocando || tocando.fim) return;
  tocando.fim = true;
  marcar(kAtual());
  const prox = proximoEpisodio();
  const fim = $('#player-fim');
  if (!fim) return;
  // Sem reprodução automática do próximo: quem escolhe é ele.
  fim.innerHTML = `<div class="fim-caixa">
    <p class="fim-titulo">Fim de "${esc(tocando.titulo)}"</p>
    <p class="ok-txt">✓ Marcado como assistido</p>
    <div class="acoes">
      ${prox ? `<button type="button" class="btn btn-play" data-fim="proximo">▶ Próximo: ${esc(prox.titulo)}</button>` : ''}
      <button type="button" class="btn btn-sec" data-fim="denovo">Assistir de novo</button>
      <button type="button" class="btn btn-sec" data-fechar-player>Voltar ao Microflix</button>
    </div></div>`;
  fim.hidden = false;
}
// Pode tocar este vídeo, que apareceu dentro do player (sugestão ou cartão do YouTube)?
// Sim, se for um vídeo do próprio título ou de um canal aprovado. O canal é reconhecido pelo nome que o player informa.
// Devolve true, false, ou null quando o player ainda não disse de que canal o vídeo é.
const nomeCanal = s => semAcento(s).replace(/\s+/g, ' ').trim();
function permitido(item, vid, autor) {
  if (!item) return false;
  if (videos(item).some(v => v.player.tipo === 'youtube' && v.player.id === vid)) return true;
  if (videoDeCanalAprovado(vid)) return true;
  if (!autor) return null;
  const n = nomeCanal(autor);
  return CAT.itens.some(i => i.tipo === 'canal' && [i.canalAutor, i.canal].some(c => c && nomeCanal(c) === n));
}
function comandoYouTube(func) {
  const q = $('#quadro');
  if (q) { try { q.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [], id: 'microflix', channel: 'widget' }), '*'); } catch (e) { /* quadro fechado */ } }
}
function decidir(autor) {
  if (!tocando || tocando.tipo !== 'youtube') return;
  const r = permitido(tocando.item, tocando.vid, autor);
  if (r === true) {
    if (tocando.verificando) {
      clearTimeout(tocando.verificando); tocando.verificando = 0;
      if (tocando.mutouParaConferir) { comandoYouTube('unMute'); tocando.mutouParaConferir = false; }
      esconderFim();
      comandoYouTube('playVideo');
    }
    tocando.bloqueado = false;
  } else if (r === false) {
    if (tocando.verificando) { clearTimeout(tocando.verificando); tocando.verificando = 0; }
    tocando.bloqueado = true;
    bloquear();
  } else if (!tocando.verificando) {
    // Ainda sem o nome do canal: cobre o vídeo, deixa tocar sem som (o player só informa o canal quando toca)
    // e, no PC, pergunta também ao servidor local. Sem resposta em 10 s, bloqueia.
    const vid = tocando.vid;
    if (!tocando.mudo) { comandoYouTube('mute'); tocando.mutouParaConferir = true; }
    const fim = $('#player-fim');
    if (fim) { fim.innerHTML = '<div class="fim-caixa"><p class="fim-titulo">Conferindo o vídeo…</p></div>'; fim.hidden = false; }
    tocando.verificando = setTimeout(() => {
      if (tocando && tocando.vid === vid && tocando.verificando) { tocando.verificando = 0; tocando.bloqueado = true; bloquear(); }
    }, 10000);
    if (modoLocal) {
      fetch('api/autor?v=' + encodeURIComponent(vid), { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d && d.author_name && tocando && tocando.vid === vid && tocando.verificando) decidir(d.author_name); })
        .catch(() => { /* sem resposta: o nome pelo player ou o tempo limite decidem */ });
    }
  }
}
function bloquear() {
  comandoYouTube('stopVideo');
  tocando.fim = true;
  const fim = $('#player-fim');
  if (!fim) return;
  fim.innerHTML = `<div class="fim-caixa">
    <p class="fim-titulo">Esse vídeo não está no Microflix</p>
    <p class="porque">Ele veio de uma sugestão do YouTube. Escolha outro título no Microflix.</p>
    <div class="acoes">
      <button type="button" class="btn btn-play" data-fim="original">▶ Voltar para "${esc(tocando.video.titulo)}"</button>
      <button type="button" class="btn btn-sec" data-fechar-player>Voltar ao Microflix</button>
    </div></div>`;
  fim.hidden = false;
}
function trocarVideo(novoId, titulo, autor) {
  guardarProgresso();
  if (tocando.verificando) { clearTimeout(tocando.verificando); tocando.verificando = 0; }
  tocando.vid = novoId; tocando.t = 0; tocando.d = 0; tocando.fim = false; tocando.bloqueado = false;
  if (titulo) { tocando.titulo = titulo; const el = $('#player-titulo'); if (el) el.textContent = titulo; }
  esconderFim();
  if (tocando.tipo === 'youtube') decidir(autor);
}
function pararPlayer() {
  if (tocando) { guardarProgresso(); clearInterval(tocando.timer); clearTimeout(tocando.verificando); }
  tocando = null;
  const box = $('#player');
  box.innerHTML = '';
  box.hidden = true;
}
function fecharPlayer() {
  pararPlayer();
  if ($('#detalhe').hidden) document.body.classList.remove('travado');
  render();
  atualizarDetalhe();
}

// Conversa com o player do YouTube pela API de mensagens (a mesma que a biblioteca oficial usa).
// Insiste até o player responder, enquanto este player estiver aberto (internet lenta pode atrasar a resposta).
function ligarYouTube(quadro) {
  const enviar = o => { try { quadro.contentWindow.postMessage(JSON.stringify(o), '*'); } catch (e) { /* quadro fechado */ } };
  const ouvir = () => {
    enviar({ event: 'listening', id: 'microflix', channel: 'widget' });
    enviar({ event: 'command', func: 'addEventListener', args: ['onStateChange'], id: 'microflix', channel: 'widget' });
  };
  quadro.addEventListener('load', () => {
    if (tocando) tocando.ouviu = false;
    ouvir();
    const int = setInterval(() => {
      if (!tocando || !quadro.isConnected) { clearInterval(int); return; }
      if (!tocando.ouviu) ouvir();
    }, 1000);
  });
}
function ligarVimeo(quadro) {
  const enviar = o => { try { quadro.contentWindow.postMessage(JSON.stringify(o), 'https://player.vimeo.com'); } catch (e) { /* quadro fechado */ } };
  // O Vimeo responde com os nomes antigos (playProgress, finish) ou novos (timeupdate, ended): pede os dois.
  const ouvir = () => ['playProgress', 'timeupdate', 'finish', 'ended', 'play'].forEach(value => enviar({ method: 'addEventListener', value }));
  quadro.addEventListener('load', ouvir);
  quadro._ouvir = ouvir;
}
window.addEventListener('message', ev => {
  if (!tocando) return;
  let d;
  try { d = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data; } catch (e) { return; }
  if (!d || typeof d !== 'object') return;
  if (/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(ev.origin)) {
    tocando.ouviu = true;
    if (d.event === 'onStateChange') estadoYouTube(d.info);
    else if (d.event === 'infoDelivery' && d.info) {
      const i = d.info;
      const vd = i.videoData;
      if (vd && vd.video_id && vd.video_id !== tocando.vid) trocarVideo(vd.video_id, vd.title, vd.author);
      else if (vd && vd.author && tocando.verificando) decidir(vd.author);
      if (typeof i.muted === 'boolean' && !tocando.verificando) tocando.mudo = i.muted;
      if (typeof i.currentTime === 'number') tocando.t = i.currentTime;
      if (typeof i.duration === 'number' && i.duration > 0) tocando.d = i.duration;
      if (typeof i.playerState === 'number') estadoYouTube(i.playerState);
    }
  } else if (ev.origin === 'https://player.vimeo.com') {
    if (d.event === 'ready') { const q = $('#quadro'); if (q && q._ouvir) q._ouvir(); }
    else if ((d.event === 'playProgress' || d.event === 'timeupdate') && d.data) { tocando.t = d.data.seconds || 0; tocando.d = d.data.duration || tocando.d; }
    else if (d.event === 'finish' || d.event === 'ended') fimDoVideo();
    else if (d.event === 'play') esconderFim();
  }
});
function estadoYouTube(s) {
  if (tocando.bloqueado) { if (s === 1) bloquear(); return; }
  if (tocando.verificando) return;
  if (s === 0) fimDoVideo();
  else if (s === 1) esconderFim();
}

/* ---------- cliques e teclas ---------- */
document.addEventListener('click', e => {
  const alvo = e.target.closest('[data-ir],[data-item],[data-tocar],[data-lista],[data-marcar],[data-ep],[data-cv],[data-recarregar],[data-fim],[data-fechar-player],[data-fechar],[data-rolar]');
  if (!alvo) return;
  const ds = alvo.dataset;
  if (ds.ir) { e.preventDefault(); fecharDetalhe(); ir(ds.ir); return; }
  if (ds.rolar) { const tr = alvo.parentElement.querySelector('.trilho'); tr.scrollBy({ left: Number(ds.rolar) * tr.clientWidth * 0.85 }); return; }
  if (ds.item) { abrirDetalhe(ds.item); return; }
  if (ds.tocar) { const item = porId.get(ds.tocar); tocar(item, item && proximo(item)); return; }
  if (ds.lista) {
    const i = mem.lista.indexOf(ds.lista);
    if (i >= 0) mem.lista.splice(i, 1); else mem.lista.unshift(ds.lista);
    salvar(); render(); atualizarDetalhe(); return;
  }
  if (ds.marcar) {
    const item = porId.get(ds.marcar);
    if (!item) return;
    const marcarTudo = !situacao(item).assistido;
    videos(item).forEach(v => marcar(chave(v.player), marcarTudo));
    render(); atualizarDetalhe(); return;
  }
  if (ds.ep) { const [id, n] = ds.ep.split('|'); const item = porId.get(id); tocar(item, item && videos(item)[Number(n)]); return; }
  if (ds.cv) {
    const [id, vid] = ds.cv.split('|');
    const item = porId.get(id);
    if (!item) return;
    const lista = cacheCanal.get(item.canalId) || (listaGuardada(item.canalId) || {}).vids || [];
    const v = lista.find(x => x.id === vid);
    tocar(item, { titulo: v ? v.titulo : item.titulo, player: { tipo: 'youtube', id: vid } });
    return;
  }
  if (ds.recarregar) {
    const item = porId.get(ds.recarregar);
    const alvoLista = $('#canal-videos');
    if (item && alvoLista) { alvoLista.innerHTML = '<p class="carregando">Carregando os vídeos…</p>'; carregarCanal(item); }
    return;
  }
  if (ds.fim) {
    if (!tocando) return;
    const item = tocando.item;
    if (ds.fim === 'proximo') { const prox = proximoEpisodio(); if (prox) tocar(item, prox); }
    else if (ds.fim === 'original') tocar(item, tocando.video);
    else if (ds.fim === 'denovo') {
      const k = kAtual();
      delete mem.progresso[k]; salvar();
      const video = tocando.vid && tocando.tipo === 'youtube' ? { titulo: tocando.titulo, player: { tipo: 'youtube', id: tocando.vid } } : tocando.video;
      tocar(item, video);
    }
    return;
  }
  if ('fecharPlayer' in ds) { fecharPlayer(); return; }
  if ('fechar' in ds) { fecharDetalhe(); }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('#player').hidden) fecharPlayer();
  else if (!$('#detalhe').hidden) fecharDetalhe();
});
$('#busca').addEventListener('input', e => {
  const antes = estado.vista;
  estado.busca = e.target.value.trim();
  if (estado.busca) {
    if (antes !== 'busca') estado.vistaAntes = antes;
    estado.vista = 'busca';
  } else {
    estado.vista = estado.vistaAntes || 'inicio';
  }
  render();
});

/* ---------- início ---------- */
// Avisa o servidor local que o Microflix está aberto (ele desliga sozinho quando a janela fica fechada).
function sinalDeVida() { fetch('api/ping', { cache: 'no-store' }).catch(() => {}); }
// Modo local: aberto pelo atalho, com o servidor do PC. Modo online: publicado num site (GitHub Pages), sem servidor.
let modoLocal = false;

async function iniciar() {
  const forcarOnline = /[?&]modo=online\b/.test(location.search);
  modoLocal = !forcarOnline && await fetch('api/ping', { cache: 'no-store' }).then(r => r.ok).catch(() => false);
  if (modoLocal) setInterval(sinalDeVida, 60000);
  let texto;
  try {
    const r = await fetch('catalogo.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    texto = await r.text();
  } catch (e) {
    $('#conteudo').innerHTML = modoLocal || location.protocol === 'file:'
      ? '<p class="erro-geral">Não consegui abrir o catálogo. Feche esta janela e abra o Microflix pelo atalho "Abrir Microflix".</p>'
      : '<p class="erro-geral">Não consegui abrir o catálogo. Confira a internet e recarregue a página.</p>';
    return;
  }
  try {
    CAT = JSON.parse(texto);
  } catch (e) {
    $('#conteudo').innerHTML = '<p class="erro-geral">O arquivo catalogo.json tem um erro de escrita. Desfaça a última mudança nele e abra o Microflix de novo.</p>';
    return;
  }
  CAT.itens = (CAT.itens || []).filter(i => i && i.id && i.titulo);
  CAT.fileiras = CAT.fileiras || [];
  porId = new Map(CAT.itens.map(i => [i.id, i]));
  mem.lista = mem.lista.filter(id => porId.has(id));
  render();
}
iniciar();
