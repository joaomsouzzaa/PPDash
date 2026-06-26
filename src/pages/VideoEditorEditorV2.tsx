import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Player } from "@remotion/player";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Play, Trash2, RefreshCw, Film, Plus, Type, Image as ImageIcon, Captions as CaptionsIcon, Music, Scissors } from "lucide-react";
import { Main } from "@/video-editor/remotion/Main";
import { EditorTimeline } from "@/components/video-editor/EditorTimeline";
import { OVERLAY_LAYOUTS, type OverlayLayout, type TextLayer } from "@/video-editor/remotion/schema";
import { useEditorDoc } from "./useEditorDoc";
import { TextDragLayer, NumBox, Cor, Num, fmt } from "./VideoEditorEditor";

const LAYOUT_NOME: Record<OverlayLayout, string> = {
  overlay_card: "Card sobreposto (print)",
  split_horizontal: "Split — b-roll em cima",
  split_bottom: "Split — b-roll embaixo",
  image_fullscreen: "Imagem/print tela cheia (sem áudio)",
  broll_fullscreen: "B-roll tela cheia (com sua voz)",
};
const round3 = (n: number) => Math.round(n * 1000) / 1000;
type Aba = "midia" | "texto" | "legenda" | "audio";

export default function VideoEditorEditorV2() {
  const { jobId = "" } = useParams();
  const navigate = useNavigate();
  const ed = useEditorDoc(jobId);
  const [aba, setAba] = useState<Aba>("midia");
  // Canvas ocupa o máximo do espaço central, mantendo 9:16.
  const canvasArea = useRef<HTMLDivElement>(null);
  const [cv, setCv] = useState({ w: 315, h: 560 });
  useEffect(() => {
    const el = canvasArea.current; if (!el) return;
    const upd = () => {
      const aw = el.clientWidth - 32, ah = el.clientHeight - 56;   // margem p/ toolbar e timecode
      let h = Math.max(240, ah), w = (h * 9) / 16;
      if (w > aw) { w = aw; h = (w * 16) / 9; }
      setCv({ w: Math.round(w), h: Math.round(h) });
    };
    upd();
    const ro = new ResizeObserver(upd); ro.observe(el);
    return () => ro.disconnect();
  }, [ed.carregando]);

  if (ed.carregando) return <div className="flex h-screen items-center justify-center text-muted-foreground bg-neutral-950">Carregando edição…</div>;
  if (!ed.doc || !ed.timeline) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-muted-foreground bg-neutral-950">
        <p>Edição não encontrada.</p>
        <Button variant="outline" onClick={() => navigate("/video-editor")}><ChevronLeft className="h-4 w-4 mr-2" /> Voltar</Button>
      </div>
    );
  }
  const doc = ed.doc, sel = ed.selected, selT = ed.selectedText;

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-neutral-800 px-3 py-2">
        <Button variant="ghost" size="icon" className="text-neutral-300" onClick={() => navigate("/video-editor")}><ChevronLeft className="h-4 w-4" /></Button>
        <Film className="h-4 w-4 text-violet-400" />
        <h1 className="text-sm font-semibold truncate flex-1">{ed.nome}</h1>
        <Button onClick={() => ed.renderizar(() => navigate("/video-editor"))} disabled={ed.renderizando} className="bg-violet-600 hover:bg-violet-500">
          {ed.renderizando ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />} Exportar
        </Button>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Barra de ícones */}
        <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-neutral-800 py-2">
          {([["midia", ImageIcon, "Mídia"], ["texto", Type, "Texto"], ["legenda", CaptionsIcon, "Legendas"], ["audio", Music, "Áudio"]] as const).map(([id, Icon, label]) => (
            <button key={id} onClick={() => setAba(id)}
              className={`flex w-14 flex-col items-center gap-1 rounded-md py-2 text-[10px] ${aba === id ? "bg-violet-600/20 text-violet-300" : "text-neutral-400 hover:bg-neutral-800"}`}>
              <Icon className="h-5 w-5" /> {label}
            </button>
          ))}
        </nav>

        {/* Painel contextual */}
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-neutral-800 p-3">
          {aba === "midia" && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-neutral-400">Mídias — clique para inserir</p>
              <div className="grid grid-cols-3 gap-2">
                {ed.assetIds.length === 0 && <p className="text-xs text-neutral-500">Nenhuma mídia.</p>}
                {ed.assetIds.map((id) => {
                  const path = doc.assets[id]; const isVid = ed.VIDEO_EXT.test(path);
                  return (
                    <button key={id} onClick={() => ed.addClip(id)} title={id}
                      className="group relative aspect-square overflow-hidden rounded-md border border-neutral-700 hover:ring-2 hover:ring-violet-500">
                      {isVid ? <video src={`${ed.mediaBase}/${path}`} muted className="h-full w-full object-cover" />
                        : <img src={`${ed.mediaBase}/${path}`} alt={id} className="h-full w-full object-cover" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {aba === "texto" && (
            <div className="space-y-2">
              <Button size="sm" className="w-full" onClick={ed.addText}><Type className="h-4 w-4 mr-1" /> Adicionar texto</Button>
              {ed.texts.map((t) => (
                <button key={t.id} onClick={() => ed.setSelectedTextId(t.id)}
                  className={`flex w-full items-center justify-between rounded border px-2 py-1.5 text-left text-xs ${t.id === ed.selectedTextId ? "border-sky-500 bg-sky-500/10" : "border-neutral-700 hover:bg-neutral-800"}`}>
                  <span className="truncate">T · {t.text}</span><span className="text-neutral-500">{fmt(t.start)}</span>
                </button>
              ))}
              {ed.texts.length === 0 && <p className="text-xs text-neutral-500">Nenhuma camada de texto ainda.</p>}
            </div>
          )}
          {aba === "legenda" && (
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wide text-neutral-400">Legenda</p>
              <div className="grid grid-cols-2 gap-2">
                <Cor label="Palavra" value={ed.capStyle.color} onChange={(v) => ed.setCapStyle({ color: v })} />
                <Cor label="Palavra ativa" value={ed.capStyle.activeColor} onChange={(v) => ed.setCapStyle({ activeColor: v })} />
                <Cor label="Borda" value={ed.capStyle.borderColor} onChange={(v) => ed.setCapStyle({ borderColor: v })} />
                <Cor label="Fundo" value={ed.capStyle.bgColor === "transparent" ? "#000000" : ed.capStyle.bgColor}
                  onChange={(v) => ed.setCapStyle({ bgColor: v })}
                  extra={<button className="text-[10px] underline text-neutral-400" onClick={() => ed.setCapStyle({ bgColor: "transparent" })}>sem fundo</button>} />
                <Num label="Tamanho" value={ed.capStyle.fontSize} min={32} max={140} onChange={(v) => ed.setCapStyle({ fontSize: v })} />
                <Num label="Borda (px)" value={ed.capStyle.borderWidth} min={0} max={14} onChange={(v) => ed.setCapStyle({ borderWidth: v })} />
                <Num label="Altura (px)" value={ed.capStyle.posicaoY} min={80} max={900} step={10} onChange={(v) => ed.setCapStyle({ posicaoY: v })} />
                <Num label="Palavras/linha" value={ed.capStyle.palavrasPorPagina} min={1} max={6} onChange={(v) => ed.setCapStyle({ palavrasPorPagina: v })} />
              </div>
              <label className="flex items-center gap-2 text-xs text-neutral-400">
                <input type="checkbox" checked={ed.capStyle.animar} onChange={(e) => ed.setCapStyle({ animar: e.target.checked })} /> Animar palavra ativa
              </label>
              <p className="text-[11px] text-neutral-500">✏️ Duplo-clique no bloco da legenda na timeline para corrigir o texto. Arraste a legenda no preview para reposicionar.</p>
            </div>
          )}
          {aba === "audio" && (
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wide text-neutral-400">Áudio</p>
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-400 flex justify-between"><span>Volume do vídeo</span><span>{Math.round(ed.videoVolume * 100)}%</span></label>
                <input type="range" min={0} max={100} value={Math.round(ed.videoVolume * 100)} onChange={(e) => ed.setVideoVolume(Number(e.target.value) / 100)} className="w-full" />
              </div>
              {!ed.music ? (
                <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-neutral-700 px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800">
                  {ed.subindoMusica ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar música
                  <input type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) ed.uploadMusica(f); e.currentTarget.value = ""; }} />
                </label>
              ) : (
                <div className="space-y-2 rounded-md border border-neutral-700 p-2">
                  <div className="flex items-center justify-between text-xs"><span className="truncate">🎵 {ed.music.asset.split("/").pop()}</span>
                    <Button variant="ghost" size="sm" className="h-7 text-red-400" onClick={ed.removerMusica}><Trash2 className="h-4 w-4" /></Button></div>
                  <label className="text-[11px] text-neutral-400 flex justify-between"><span>Volume da música</span><span>{Math.round(ed.music.volume * 100)}%</span></label>
                  <input type="range" min={0} max={100} value={Math.round(ed.music.volume * 100)} onChange={(e) => ed.setMusicVol(Number(e.target.value) / 100)} className="w-full" />
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Canvas central */}
        <main ref={canvasArea} className="relative flex flex-1 flex-col items-center justify-center bg-neutral-900 p-4">
          {/* Toolbar flutuante do elemento selecionado */}
          {(sel || selT) && (
            <div className="absolute top-2 left-1/2 z-10 -translate-x-1/2">
              {sel && <ClipToolbar ed={ed} sel={sel} />}
              {selT && !sel && <TextToolbar ed={ed} selT={selT} />}
            </div>
          )}

          <div style={{ width: cv.w, height: cv.h, position: "relative" }} className="overflow-hidden rounded-lg border border-neutral-700 bg-black shadow-2xl">
            <Player
              ref={ed.playerRef}
              component={Main as any}
              inputProps={{ timeline: ed.timeline, words: ed.outWords, assets: doc.assets, mediaBase: ed.mediaBase, preview: true, captionStyle: ed.capStyle, videoVolume: ed.videoVolume, music: ed.music, texts: ed.texts }}
              durationInFrames={ed.durationInFrames}
              fps={ed.fps}
              compositionWidth={1080}
              compositionHeight={1920}
              style={{ width: cv.w, height: cv.h }}
              controls clickToPlay={false} doubleClickToFullscreen={false} acknowledgeRemotionLicense
            />
            <TextDragLayer texts={ed.texts} currentTime={ed.currentTime} selectedId={ed.selectedTextId}
              onSelect={ed.setSelectedTextId} onMove={ed.updateText} words={ed.outWords} captionStyle={ed.capStyle}
              onMoveCaption={(y) => ed.setCapStyle({ posicaoY: y })} mostrarLegenda={aba === "legenda"} />
          </div>
          <p className="mt-1 text-xs text-neutral-400">{fmt(ed.currentTime)} / {fmt(doc.durationInSeconds)}</p>
        </main>
      </div>

      {/* Timeline full-width */}
      <div className="max-h-[34vh] overflow-y-auto border-t border-neutral-800 bg-neutral-950 p-2">
        <EditorTimeline
          clips={doc.clips} duration={doc.durationInSeconds} currentTime={ed.currentTime} selectedId={ed.selectedId}
          words={doc.words} palavrasPorPagina={ed.capStyle.palavrasPorPagina}
          onSeek={ed.seek} onSelect={ed.setSelectedId} onUpdateClip={ed.updateClip} onEditCaption={ed.editCaption}
          music={ed.music} onMusicStart={ed.setMusicStart}
          videoSegments={ed.videoSegments} originalDuration={ed.originalDuration}
          onTrimSeg={ed.trimSeg} onDeleteSeg={ed.deleteSeg} onSplit={() => ed.splitAt(ed.currentTime)}
          texts={ed.texts} selectedTextId={ed.selectedTextId} onSelectText={ed.setSelectedTextId}
          onUpdateText={ed.updateText} onEditTextContent={(id, t) => ed.updateText(id, { text: t })}
        />
      </div>
    </div>
  );
}

// Toolbar flutuante para o b-roll selecionado.
function ClipToolbar({ ed, sel }: { ed: ReturnType<typeof useEditorDoc>; sel: NonNullable<ReturnType<typeof useEditorDoc>["selected"]> }) {
  const ehSplit = (["split_horizontal", "split_bottom", "split_vertical"] as string[]).includes(sel.layout);
  const pct = Math.round((sel.splitRatio ?? 0.6) * 100);
  const cr = sel.crop; const w = cr?.w ?? 1; const zoom = Math.round((1 / w) * 100);
  const ehBroll = (["split_horizontal", "split_bottom", "split_vertical", "broll_fullscreen", "image_fullscreen"] as string[]).includes(sel.layout);
  const setZoom = (zz: number) => {
    const ww = 1 / (zz / 100);
    if (zz <= 100) ed.updateClip(sel.id, { crop: undefined });
    else ed.updateClip(sel.id, { crop: { x: round3(((1 - ww) / 2)), y: round3(((1 - ww) / 2)), w: round3(ww), h: round3(ww) } });
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800/95 px-3 py-2 shadow-xl backdrop-blur">
      <Select value={sel.layout} onValueChange={(v) => ed.updateClip(sel.id, { layout: v as OverlayLayout })}>
        <SelectTrigger className="h-8 w-[210px] bg-neutral-900 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{OVERLAY_LAYOUTS.map((l) => <SelectItem key={l} value={l}>{LAYOUT_NOME[l]}</SelectItem>)}</SelectContent>
      </Select>
      <div className="flex items-center gap-1 text-[11px] text-neutral-300">Divisão
        <NumBox value={pct} min={20} max={80} onCommit={(v) => { const p: any = { splitRatio: v / 100 }; if (!ehSplit) p.layout = "split_horizontal"; ed.updateClip(sel.id, p); }}
          className="h-7 w-12 rounded border border-neutral-600 bg-neutral-900 px-1 text-right text-[11px]" />%
      </div>
      <div className="flex items-center gap-1 text-[11px] text-neutral-300">Zoom
        <NumBox value={zoom} min={100} max={400} onCommit={setZoom} className="h-7 w-14 rounded border border-neutral-600 bg-neutral-900 px-1 text-right text-[11px]" />%
      </div>
      {ehBroll && (
        <div className="flex items-center gap-1 text-[11px] text-neutral-300" title="Posição vertical do b-roll">↕
          <input type="range" min={0} max={100} value={sel.cropY ?? 50} onChange={(e) => ed.updateClip(sel.id, { cropY: Number(e.target.value) })} className="w-20" />
        </div>
      )}
      <button onClick={() => ed.splitClip(sel.id)} className="flex items-center gap-1 rounded border border-neutral-600 px-2 py-1 text-[11px] hover:bg-neutral-700"><Scissors className="h-3.5 w-3.5" /> Dividir</button>
      <button onClick={() => ed.removeClip(sel.id)} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-red-400 hover:bg-neutral-700"><Trash2 className="h-3.5 w-3.5" /> Remover</button>
    </div>
  );
}

// Toolbar flutuante para o texto selecionado.
function TextToolbar({ ed, selT }: { ed: ReturnType<typeof useEditorDoc>; selT: TextLayer }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800/95 px-3 py-2 shadow-xl backdrop-blur">
      <input value={selT.text} onChange={(e) => ed.updateText(selT.id, { text: e.target.value })}
        className="h-8 w-44 rounded border border-neutral-600 bg-neutral-900 px-2 text-xs" />
      <Cor label="Cor" value={selT.color} onChange={(v) => ed.updateText(selT.id, { color: v })} />
      <Cor label="Fundo" value={selT.bgColor === "transparent" ? "#000000" : selT.bgColor} onChange={(v) => ed.updateText(selT.id, { bgColor: v })}
        extra={<button className="text-[10px] underline text-neutral-400" onClick={() => ed.updateText(selT.id, { bgColor: "transparent" })}>sem fundo</button>} />
      <div className="flex items-center gap-1 text-[11px] text-neutral-300">Tam
        <NumBox value={selT.fontSize} min={24} max={220} onCommit={(v) => ed.updateText(selT.id, { fontSize: v })} className="h-7 w-14 rounded border border-neutral-600 bg-neutral-900 px-1 text-right text-[11px]" />
      </div>
      <label className="flex items-center gap-1 text-[11px] text-neutral-300"><input type="checkbox" checked={selT.bold} onChange={(e) => ed.updateText(selT.id, { bold: e.target.checked })} /> Negrito</label>
      <button onClick={() => ed.removeText(selT.id)} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-red-400 hover:bg-neutral-700"><Trash2 className="h-3.5 w-3.5" /> Remover</button>
    </div>
  );
}
