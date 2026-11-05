"""Atualiza o canais.json do Microflix: os 15 vídeos longos mais recentes de cada canal aprovado.

Os canais aprovados são os itens do tipo "canal" no catalogo.json. A lista vem do feed público do YouTube
(playlist UULF, que deixa de fora Shorts e lives). Se um canal não responder, fica a lista anterior dele.

Uso, na pasta do Microflix:  python ferramentas/atualizar_canais.py
"""
import datetime
import json
import os
import sys
import urllib.request
import xml.etree.ElementTree as ET

NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def dia_logico():
    # Dia de Brasília (UTC-3), que só vira às 04:00.
    agora = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=3 + 4)
    return agora.date().isoformat()


def videos_do_canal(canal_id):
    url = "https://www.youtube.com/feeds/videos.xml?playlist_id=UULF" + canal_id[2:]
    req = urllib.request.Request(url, headers={"User-Agent": "Microflix"})
    with urllib.request.urlopen(req, timeout=30) as r:
        raiz = ET.fromstring(r.read())
    vids = []
    for e in raiz.findall("a:entry", NS):
        vid = e.findtext("yt:videoId", namespaces=NS)
        if vid:
            vids.append({"id": vid, "titulo": e.findtext("a:title", default="", namespaces=NS),
                         "publicado": (e.findtext("a:published", default="", namespaces=NS) or "")[:10]})
    return vids


def main():
    catalogo = json.load(open(os.path.join(RAIZ, "catalogo.json"), encoding="utf-8"))
    caminho = os.path.join(RAIZ, "canais.json")
    anterior = {}
    if os.path.exists(caminho):
        anterior = json.load(open(caminho, encoding="utf-8")).get("canais", {})
    canais, falhas = {}, []
    for it in catalogo.get("itens", []):
        cid = it.get("canalId")
        if it.get("tipo") != "canal" or not cid:
            continue
        try:
            vids = videos_do_canal(cid)
            if not vids:
                raise ValueError("lista vazia")
            canais[cid] = vids
        except Exception as erro:  # noqa: BLE001
            falhas.append(f"{it.get('titulo')}: {erro}")
            if cid in anterior:
                canais[cid] = anterior[cid]
    with open(caminho, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"atualizadoEm": dia_logico(), "canais": canais}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{len(canais)} canais gravados em canais.json")
    for falha in falhas:
        print("sem resposta, ficou a lista anterior:", falha)
    novos = len(canais) - sum(1 for falha in falhas)
    return 1 if falhas and novos <= 0 else 0


if __name__ == "__main__":
    sys.exit(main())
