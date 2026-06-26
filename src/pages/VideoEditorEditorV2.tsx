import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Player } from "@remotion/player";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { ChevronLeft, Play, Pause, Trash2, RefreshCw, Film, Plus, Type, Image as ImageIcon, Captions as CaptionsIcon, Music, Scissors, Crop, Maximize2, Layers, MoreHorizontal, Copy, Replace, ZoomIn, ZoomOut, Move, BringToFront, SendToBack, Check } from "lucide-react";
import { Main } from "@/video-editor/remotion/Main";
import { EditorTimeline } from "@/components/video-editor/EditorTimeline";
import { OVERLAY_LAYOUTS, isFree, type OverlayLayout, type TextLayer } from "@/video-editor/remotion/schema";
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
  const [cropMode, setCropMode] = useState(false);  // modo recorte da camada livre selecionada
  const [zf, setZf] = useState(1);   // zoom da VIEW (1 = ajustado à tela)
  const [tlHeight, setTlHeight] = useState(240);  // altura da timeline (arrastável)
  const startResizeTl = (e: React.PointerEvent) => {
    e.preventDefault();
    const y0 = e.clientY, h0 = tlHeight;
    const mv = (ev: PointerEvent) => setTlHeight(Math.min(window.innerHeight * 0.7, Math.max(120, h0 + (y0 - ev.clientY))));
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  useEffect(() => { setCropMode(false); }, [ed.selectedId]);
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
        {/* Zoom da view (canvas) */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800">
              {Math.round(zf * 100)}% <span className="text-neutral-500">▾</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 bg-neutral-900 text-neutral-100 border-neutral-700">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ZoomOut className="h-4 w-4 cursor-pointer" onClick={() => setZf((z) => Math.max(0.3, Math.round((z - 0.1) * 10) / 10))} />
                <input type="range" min={30} max={250} value={Math.round(zf * 100)} onChange={(e) => setZf(Number(e.target.value) / 100)} className="flex-1" />
                <ZoomIn className="h-4 w-4 cursor-pointer" onClick={() => setZf((z) => Math.min(2.5, Math.round((z + 0.1) * 10) / 10))} />
              </div>
              <button className="w-full rounded px-2 py-1 text-left text-xs hover:bg-neutral-800" onClick={() => setZf(1)}>Ajustar à tela</button>
              <button className="w-full rounded px-2 py-1 text-left text-xs hover:bg-neutral-800" onClick={() => setZf(0.5)}>50%</button>
              <button className="w-full rounded px-2 py-1 text-left text-xs hover:bg-neutral-800" onClick={() => setZf(1)}>100% (ajustado)</button>
              <button className="w-full rounded px-2 py-1 text-left text-xs hover:bg-neutral-800" onClick={() => setZf(2)}>200%</button>
            </div>
          </PopoverContent>
        </Popover>
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
        <main ref={canvasArea} className="relative flex flex-1 flex-col items-center justify-center overflow-auto bg-neutral-900 p-4">
          {/* Toolbar flutuante de ícones do elemento selecionado */}
          {(sel || selT) && (
            <div className="absolute top-2 left-1/2 z-10 -translate-x-1/2">
              {sel && <ClipToolbar ed={ed} sel={sel} onAddLayer={() => setAba("midia")} cropMode={cropMode} setCropMode={setCropMode} />}
              {selT && !sel && <TextToolbar ed={ed} selT={selT} />}
            </div>
          )}

          <div style={{ width: cv.w * zf, height: cv.h * zf, position: "relative", flexShrink: 0 }} className="overflow-hidden rounded-lg border border-neutral-700 bg-black shadow-2xl">
            <Player
              ref={ed.playerRef}
              component={Main as any}
              inputProps={{ timeline: ed.timeline, words: ed.outWords, assets: doc.assets, mediaBase: ed.mediaBase, preview: true, captionStyle: ed.capStyle, videoVolume: ed.videoVolume, music: ed.music, texts: ed.texts }}
              durationInFrames={ed.durationInFrames}
              fps={ed.fps}
              compositionWidth={1080}
              compositionHeight={1920}
              style={{ width: cv.w * zf, height: cv.h * zf }}
              clickToPlay={false} doubleClickToFullscreen={false} acknowledgeRemotionLicense
            />
            {/* Seleção por clique + caixas de transform das camadas livres (mídia flutuante) */}
            <FreeLayersOverlay ed={ed} W={cv.w * zf} H={cv.h * zf} cropMode={cropMode} />
            {sel && !isFree(sel) && <BrollTransform clip={sel} currentTime={ed.currentTime} onUpdate={ed.updateClip} W={cv.w * zf} H={cv.h * zf} />}
            <TextDragLayer texts={ed.texts} currentTime={ed.currentTime} selectedId={ed.selectedTextId}
              onSelect={ed.setSelectedTextId} onMove={ed.updateText} words={ed.outWords} captionStyle={ed.capStyle}
              onMoveCaption={(y) => ed.setCapStyle({ posicaoY: y })} mostrarLegenda={true} />
          </div>
        </main>
      </div>

      {/* Divisória arrastável: aumenta/diminui a timeline */}
      <div onPointerDown={startResizeTl} title="Arraste para aumentar/diminuir a timeline"
        className="group flex h-2 cursor-row-resize items-center justify-center border-t border-neutral-800 bg-neutral-900 hover:bg-violet-600/30">
        <div className="h-0.5 w-10 rounded bg-neutral-600 group-hover:bg-violet-400" />
      </div>

      {/* Barra de ações + play + timecode (acima da timeline) */}
      <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1.5">
        <div className="flex items-center gap-1">
          <button onClick={() => sel ? ed.splitClip(sel.id) : ed.splitAt(ed.currentTime)} title="Dividir no playhead" className="rounded p-1.5 text-neutral-300 hover:bg-neutral-800"><Scissors className="h-4 w-4" /></button>
          <button onClick={() => sel && ed.removeClip(sel.id)} disabled={!sel} title="Excluir" className="rounded p-1.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
          <button onClick={() => sel && ed.duplicateClip(sel.id)} disabled={!sel} title="Duplicar" className="rounded p-1.5 text-neutral-300 hover:bg-neutral-800 disabled:opacity-30"><Copy className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-1 items-center justify-center gap-3">
          <button onClick={ed.togglePlay} className="rounded-full bg-neutral-800 p-2 hover:bg-neutral-700">
            {ed.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <span className="text-xs tabular-nums text-neutral-300">{fmtMs(ed.currentTime)} <span className="text-neutral-600">/ {fmtMs(doc.durationInSeconds)}</span></span>
        </div>
        <div className="w-[120px]" />
      </div>

      {/* Timeline full-width (altura arrastável) */}
      <div style={{ height: tlHeight }} className="overflow-y-auto border-t border-neutral-800 bg-neutral-950 p-2">
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

// Toolbar flutuante de ÍCONES para o b-roll selecionado (estilo CapCut).
function ClipToolbar({ ed, sel, onAddLayer, cropMode, setCropMode }: { ed: ReturnType<typeof useEditorDoc>; sel: NonNullable<ReturnType<typeof useEditorDoc>["selected"]>; onAddLayer: () => void; cropMode: boolean; setCropMode: (v: boolean) => void }) {
  const livre = isFree(sel);
  const ehSplit = (["split_horizontal", "split_bottom", "split_vertical"] as string[]).includes(sel.layout);
  const pct = Math.round((sel.splitRatio ?? 0.6) * 100);
  const cr = sel.crop; const w = cr?.w ?? 1; const zoom = Math.round((1 / w) * 100);
  const ehBroll = (["split_horizontal", "split_bottom", "split_vertical", "broll_fullscreen", "image_fullscreen"] as string[]).includes(sel.layout);
  const setZoom = (zz: number) => {
    const ww = 1 / (zz / 100);
    if (zz <= 100) ed.updateClip(sel.id, { crop: undefined });
    else ed.updateClip(sel.id, { crop: { x: round3((1 - ww) / 2), y: round3((1 - ww) / 2), w: round3(ww), h: round3(ww) } });
  };
  const Btn = ({ icon: Icon, title, onClick }: { icon: any; title: string; onClick?: () => void }) => (
    <button title={title} onClick={onClick} className="rounded p-1.5 text-neutral-200 hover:bg-neutral-700"><Icon className="h-4 w-4" /></button>
  );
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-neutral-700 bg-neutral-800/95 px-1.5 py-1 shadow-xl backdrop-blur">
      <Btn icon={ImageIcon} title="Adicionar camada" onClick={onAddLayer} />
      {/* Posição livre / recorte / z-order (camada flutuante estilo Canva/CapCut) */}
      {!livre
        ? <Btn icon={Move} title="Posição livre (mover/redimensionar na tela)" onClick={() => ed.makeFree(sel.id)} />
        : <button title={cropMode ? "Concluir recorte" : "Recortar (arrastar bordas)"} onClick={() => setCropMode(!cropMode)}
            className={`rounded p-1.5 ${cropMode ? "bg-sky-600 text-white" : "text-neutral-200 hover:bg-neutral-700"}`}>{cropMode ? <Check className="h-4 w-4" /> : <Crop className="h-4 w-4" />}</button>}
      {livre && <Btn icon={BringToFront} title="Trazer para frente" onClick={() => ed.bringToFront(sel.id)} />}
      {livre && <Btn icon={SendToBack} title="Enviar para trás" onClick={() => ed.sendToBack(sel.id)} />}
      {livre && <Btn icon={Maximize2} title="Camada em tela cheia" onClick={() => ed.updateClip(sel.id, { box: { x: 0, y: 0, w: 1, h: 1 }, rotation: 0 })} />}
      <Btn icon={Maximize2} title="Ajustar à tela (remove recorte)" onClick={() => ed.updateClip(sel.id, { crop: undefined, cropY: 50 })} />
      {/* Recortar / ajustes */}
      <Popover>
        <PopoverTrigger asChild><button title="Recortar / ajustar" className="rounded p-1.5 text-neutral-200 hover:bg-neutral-700"><Crop className="h-4 w-4" /></button></PopoverTrigger>
        <PopoverContent className="w-72 space-y-3 bg-neutral-900 text-neutral-100 border-neutral-700">
          <div className="space-y-1">
            <label className="text-[11px] text-neutral-400">Layout</label>
            <Select value={sel.layout} onValueChange={(v) => ed.updateClip(sel.id, { layout: v as OverlayLayout })}>
              <SelectTrigger className="h-8 w-full bg-neutral-800 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{OVERLAY_LAYOUTS.map((l) => <SelectItem key={l} value={l}>{LAYOUT_NOME[l]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-neutral-300">Divisão
            <NumBox value={pct} min={20} max={80} onCommit={(v) => { const p: any = { splitRatio: v / 100 }; if (!ehSplit) p.layout = "split_horizontal"; ed.updateClip(sel.id, p); }}
              className="h-7 w-14 rounded border border-neutral-600 bg-neutral-800 px-1 text-right text-[11px]" />% vídeo
          </div>
          <div className="flex items-center gap-2 text-[11px] text-neutral-300">Zoom
            <NumBox value={zoom} min={100} max={400} onCommit={setZoom} className="h-7 w-14 rounded border border-neutral-600 bg-neutral-800 px-1 text-right text-[11px]" />%
          </div>
          {ehBroll && (
            <div className="space-y-1">
              <label className="text-[11px] text-neutral-400 flex justify-between"><span>Posição vertical do b-roll</span><span>{sel.cropY ?? 50}%</span></label>
              <input type="range" min={0} max={100} value={sel.cropY ?? 50} onChange={(e) => ed.updateClip(sel.id, { cropY: Number(e.target.value) })} className="w-full" />
            </div>
          )}
        </PopoverContent>
      </Popover>
      <Btn icon={Scissors} title="Dividir no playhead" onClick={() => ed.splitClip(sel.id)} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button title="Mais" className="rounded p-1.5 text-neutral-200 hover:bg-neutral-700"><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger>
        <DropdownMenuContent className="bg-neutral-900 text-neutral-100 border-neutral-700">
          <DropdownMenuItem onClick={() => ed.duplicateClip(sel.id)}><Copy className="h-4 w-4 mr-2" /> Duplicar</DropdownMenuItem>
          <DropdownMenuItem onClick={() => ed.splitClip(sel.id)}><Scissors className="h-4 w-4 mr-2" /> Dividir</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger><Replace className="h-4 w-4 mr-2" /> Substituir mídia</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="bg-neutral-900 text-neutral-100 border-neutral-700 max-h-64 overflow-y-auto">
              {ed.assetIds.map((id) => <DropdownMenuItem key={id} onClick={() => ed.updateClip(sel.id, { asset: id })}>{id}</DropdownMenuItem>)}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-red-400" onClick={() => ed.removeClip(sel.id)}><Trash2 className="h-4 w-4 mr-2" /> Excluir</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function fmtMs(s: number) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60), cs = Math.floor((s % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}:${String(cs).padStart(2, "0")}`;
}

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
// Região onde o b-roll aparece (fração do preview), por layout + proporção do split.
function brollRegion(layout: string, ratio?: number): { left: number; top: number; w: number; h: number } | null {
  const r = Math.min(0.9, Math.max(0.1, ratio ?? 0.6));
  switch (layout) {
    case "split_horizontal": return { left: 0, top: 0, w: 1, h: 1 - r };
    case "split_bottom": return { left: 0, top: r, w: 1, h: 1 - r };
    case "split_vertical": return { left: r, top: 0, w: 1 - r, h: 1 };
    case "broll_fullscreen": case "image_fullscreen": return { left: 0, top: 0, w: 1, h: 1 };
    default: return null;
  }
}

// Caixa de transform do b-roll no preview: arrastar p/ reposicionar + alças de canto p/ zoom/recorte.
function BrollTransform({ clip, currentTime, onUpdate, W, H }: {
  clip: NonNullable<ReturnType<typeof useEditorDoc>["selected"]>;
  currentTime: number; onUpdate: (id: string, patch: any) => void; W: number; H: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ativo = currentTime >= clip.start - 0.001 && currentTime < clip.end;
  const region = brollRegion(clip.layout, clip.splitRatio);
  if (!ativo || !region) return null;
  const left = region.left * W, top = region.top * H, w = region.w * W, h = region.h * H;

  // Arrastar = reposicionar (pan). Com zoom: move dentro do recorte; sem zoom: ajusta posição vertical (cropY).
  const startPan = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
    const c0 = clip.crop; const cy0 = clip.cropY ?? 50; const sx = e.clientX, sy = e.clientY;
    const mv = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (c0 && c0.w < 0.999) {
        onUpdate(clip.id, { crop: { ...c0, x: round3(clamp(c0.x - (dx / w) * c0.w, 0, 1 - c0.w)), y: round3(clamp(c0.y - (dy / h) * c0.h, 0, 1 - c0.h)) } });
      } else {
        onUpdate(clip.id, { cropY: Math.round(clamp(cy0 - (dy / h) * 100, 0, 100)) });
      }
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  // Alça de canto = zoom (escala pela distância ao centro). Zoom 100% remove o recorte.
  const startScale = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
    const rect = ref.current?.getBoundingClientRect(); if (!rect) return;
    const cx = rect.left + left + w / 2, cy = rect.top + top + h / 2;
    const d0 = Math.max(8, Math.hypot(e.clientX - cx, e.clientY - cy));
    const z0 = 1 / (clip.crop?.w ?? 1);
    const mv = (ev: PointerEvent) => {
      const z = clamp((z0 * Math.hypot(ev.clientX - cx, ev.clientY - cy)) / d0, 1, 4);
      if (z <= 1.001) { onUpdate(clip.id, { crop: undefined }); return; }
      const ww = 1 / z; const c = clip.crop;
      const cxF = c ? c.x + c.w / 2 : 0.5, cyF = c ? c.y + c.h / 2 : 0.5;
      onUpdate(clip.id, { crop: { x: round3(clamp(cxF - ww / 2, 0, 1 - ww)), y: round3(clamp(cyF - ww / 2, 0, 1 - ww)), w: round3(ww), h: round3(ww) } });
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  const handle = (cur: string): React.CSSProperties => ({ position: "absolute", width: 14, height: 14, borderRadius: "50%", background: "#fff", border: "2px solid #38bdf8", pointerEvents: "auto", cursor: cur, touchAction: "none" });
  return (
    <div ref={ref} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div onPointerDown={startPan}
        style={{ position: "absolute", left, top, width: w, height: h, pointerEvents: "auto", cursor: "move", touchAction: "none", outline: "2px solid #38bdf8" }}
        title="Arraste para reposicionar o b-roll · alças nos cantos para zoom/recorte">
        <div onPointerDown={startScale} style={{ ...handle("nwse-resize"), left: -7, top: -7 }} />
        <div onPointerDown={startScale} style={{ ...handle("nesw-resize"), right: -7, top: -7 }} />
        <div onPointerDown={startScale} style={{ ...handle("nesw-resize"), left: -7, bottom: -7 }} />
        <div onPointerDown={startScale} style={{ ...handle("nwse-resize"), right: -7, bottom: -7 }} />
      </div>
    </div>
  );
}

// Camada interativa das mídias FLUTUANTES (com box): clique p/ selecionar + caixa de transform.
function FreeLayersOverlay({ ed, W, H, cropMode }: { ed: ReturnType<typeof useEditorDoc>; W: number; H: number; cropMode: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const ativos = (ed.doc?.clips || []).filter((c) => isFree(c) && ed.currentTime >= c.start - 0.001 && ed.currentTime < c.end)
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  if (!ativos.length) return null;
  return (
    <div ref={ref} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {ativos.map((c) => (
        <FreeTransformBox key={c.id} containerRef={ref} clip={c} selected={c.id === ed.selectedId}
          onSelect={() => ed.setSelectedId(c.id)} onUpdate={ed.updateClip} W={W} H={H} cropMode={cropMode && c.id === ed.selectedId} />
      ))}
    </div>
  );
}

// Uma caixa de transform livre: mover, redimensionar (4 cantos), rotacionar e recortar.
function FreeTransformBox({ containerRef, clip, selected, onSelect, onUpdate, W, H, cropMode }: {
  containerRef: React.RefObject<HTMLDivElement>;
  clip: NonNullable<ReturnType<typeof useEditorDoc>["selected"]>;
  selected: boolean; onSelect: () => void; onUpdate: (id: string, patch: any) => void; W: number; H: number; cropMode: boolean;
}) {
  const box = clip.box ?? { x: 0, y: 0, w: 1, h: 1 };
  const left = box.x * W, top = box.y * H, w = box.w * W, h = box.h * H;

  const drag = (fn: (dxF: number, dyF: number, ev: PointerEvent) => void) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation(); onSelect();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
    const sx = e.clientX, sy = e.clientY;
    const mv = (ev: PointerEvent) => fn((ev.clientX - sx) / W, (ev.clientY - sy) / H, ev);
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };

  // Mover a caixa toda.
  const startMove = drag((dxF, dyF) => {
    onUpdate(clip.id, { box: { ...box, x: round3(clamp(box.x + dxF, -box.w + 0.05, 0.95)), y: round3(clamp(box.y + dyF, -box.h + 0.05, 0.95)) } });
  });
  // Redimensionar a partir de um canto (o canto oposto fica fixo).
  const startResize = (corner: "tl" | "tr" | "bl" | "br") => drag((dxF, dyF) => {
    let { x, y, w: bw, h: bh } = box;
    if (corner === "br") { bw = box.w + dxF; bh = box.h + dyF; }
    if (corner === "bl") { x = box.x + dxF; bw = box.w - dxF; bh = box.h + dyF; }
    if (corner === "tr") { y = box.y + dyF; bw = box.w + dxF; bh = box.h - dyF; }
    if (corner === "tl") { x = box.x + dxF; y = box.y + dyF; bw = box.w - dxF; bh = box.h - dyF; }
    if (bw < 0.05 || bh < 0.05) return;
    onUpdate(clip.id, { box: { x: round3(x), y: round3(y), w: round3(bw), h: round3(bh) } });
  });
  // Rotacionar (alça superior).
  const startRotate = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation(); onSelect();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
    const rect = containerRef.current?.getBoundingClientRect(); if (!rect) return;
    const cx = rect.left + left + w / 2, cy = rect.top + top + h / 2;
    const mv = (ev: PointerEvent) => {
      const ang = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90;
      onUpdate(clip.id, { rotation: Math.round(ang) });
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  // Recorte: arrastar dentro = pan; cantos = zoom (mesma lógica do b-roll).
  const startCropPan = drag((dxF, dyF) => {
    const c0 = clip.crop; if (!c0 || c0.w >= 0.999) { onUpdate(clip.id, { crop: { x: 0, y: 0, w: 0.999, h: 0.999 } }); return; }
    onUpdate(clip.id, { crop: { ...c0, x: round3(clamp(c0.x - (dxF * W / w) * c0.w, 0, 1 - c0.w)), y: round3(clamp(c0.y - (dyF * H / h) * c0.h, 0, 1 - c0.h)) } });
  });
  const startCropZoom = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
    const rect = containerRef.current?.getBoundingClientRect(); if (!rect) return;
    const cx = rect.left + left + w / 2, cy = rect.top + top + h / 2;
    const d0 = Math.max(8, Math.hypot(e.clientX - cx, e.clientY - cy));
    const z0 = 1 / (clip.crop?.w ?? 1);
    const mv = (ev: PointerEvent) => {
      const z = clamp((z0 * Math.hypot(ev.clientX - cx, ev.clientY - cy)) / d0, 1, 4);
      if (z <= 1.001) { onUpdate(clip.id, { crop: undefined }); return; }
      const ww = 1 / z; const c = clip.crop;
      const cxF = c ? c.x + c.w / 2 : 0.5, cyF = c ? c.y + c.h / 2 : 0.5;
      onUpdate(clip.id, { crop: { x: round3(clamp(cxF - ww / 2, 0, 1 - ww)), y: round3(clamp(cyF - ww / 2, 0, 1 - ww)), w: round3(ww), h: round3(ww) } });
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };

  const hdl = (cur: string): React.CSSProperties => ({ position: "absolute", width: 14, height: 14, borderRadius: "50%", background: "#fff", border: "2px solid #38bdf8", pointerEvents: "auto", cursor: cur, touchAction: "none" });
  const cropColor = "#f59e0b";
  return (
    <div style={{ position: "absolute", left, top, width: w, height: h, transform: clip.rotation ? `rotate(${clip.rotation}deg)` : undefined,
      pointerEvents: "auto", cursor: cropMode ? "move" : "move", touchAction: "none",
      outline: selected ? `2px solid ${cropMode ? cropColor : "#38bdf8"}` : "2px dashed rgba(56,189,248,0.45)" }}
      onPointerDown={cropMode ? startCropPan : startMove}
      title={cropMode ? "Arraste p/ reposicionar o recorte · cantos p/ zoom" : "Arraste p/ mover · cantos p/ redimensionar"}>
      {selected && (cropMode ? (
        <>
          <div onPointerDown={startCropZoom} style={{ ...hdl("nwse-resize"), border: `2px solid ${cropColor}`, left: -7, top: -7 }} />
          <div onPointerDown={startCropZoom} style={{ ...hdl("nesw-resize"), border: `2px solid ${cropColor}`, right: -7, top: -7 }} />
          <div onPointerDown={startCropZoom} style={{ ...hdl("nesw-resize"), border: `2px solid ${cropColor}`, left: -7, bottom: -7 }} />
          <div onPointerDown={startCropZoom} style={{ ...hdl("nwse-resize"), border: `2px solid ${cropColor}`, right: -7, bottom: -7 }} />
        </>
      ) : (
        <>
          <div onPointerDown={startResize("tl")} style={{ ...hdl("nwse-resize"), left: -7, top: -7 }} />
          <div onPointerDown={startResize("tr")} style={{ ...hdl("nesw-resize"), right: -7, top: -7 }} />
          <div onPointerDown={startResize("bl")} style={{ ...hdl("nesw-resize"), left: -7, bottom: -7 }} />
          <div onPointerDown={startResize("br")} style={{ ...hdl("nwse-resize"), right: -7, bottom: -7 }} />
          {/* Alça de rotação */}
          <div onPointerDown={startRotate} style={{ ...hdl("grab"), left: "50%", top: -28, marginLeft: -7, background: "#38bdf8" }} />
          <div style={{ position: "absolute", left: "50%", top: -21, width: 1, height: 14, background: "#38bdf8" }} />
        </>
      ))}
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
      <button title="Trazer para frente" onClick={() => ed.bringToFront(selT.id)} className="rounded p-1.5 text-neutral-200 hover:bg-neutral-700"><BringToFront className="h-4 w-4" /></button>
      <button title="Enviar para trás" onClick={() => ed.sendToBack(selT.id)} className="rounded p-1.5 text-neutral-200 hover:bg-neutral-700"><SendToBack className="h-4 w-4" /></button>
      <button onClick={() => ed.removeText(selT.id)} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-red-400 hover:bg-neutral-700"><Trash2 className="h-3.5 w-3.5" /> Remover</button>
    </div>
  );
}
