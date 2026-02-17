import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, Plus, ChevronDown, Pencil, Trash2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TagSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function TagSelector({ value, onChange }: TagSelectorProps) {
  const [allTags, setAllTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [open, setOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const selectedTags = value
    ? value.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  useEffect(() => {
    supabase
      .from("tags")
      .select("nome")
      .order("nome")
      .then(({ data }) => {
        if (data) setAllTags(data.map((t) => t.nome));
      });
  }, []);

  const toggleTag = (tag: string) => {
    const next = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
    onChange(next.join(", "));
  };

  const addNewTag = async () => {
    const trimmed = newTag.trim();
    if (!trimmed || allTags.includes(trimmed)) return;

    await supabase.from("tags").upsert({ nome: trimmed }, { onConflict: "nome" } as any);
    setAllTags((prev) => [...prev, trimmed].sort());
    onChange([...selectedTags, trimmed].join(", "));
    setNewTag("");
  };

  const deleteTag = async (tag: string) => {
    const { error } = await supabase.from("tags").delete().eq("nome", tag);
    if (error) {
      toast.error("Erro ao excluir tag");
      return;
    }
    setAllTags((prev) => prev.filter((t) => t !== tag));
    // Also remove from selected if present
    if (selectedTags.includes(tag)) {
      onChange(selectedTags.filter((t) => t !== tag).join(", "));
    }
    toast.success("Tag excluída");
  };

  const startEdit = (tag: string) => {
    setEditingTag(tag);
    setEditValue(tag);
  };

  const saveEdit = async () => {
    if (!editingTag || !editValue.trim() || editValue.trim() === editingTag) {
      setEditingTag(null);
      return;
    }
    const newName = editValue.trim();
    const { error } = await supabase
      .from("tags")
      .update({ nome: newName })
      .eq("nome", editingTag);
    if (error) {
      toast.error("Erro ao renomear tag");
      return;
    }
    setAllTags((prev) => prev.map((t) => (t === editingTag ? newName : t)).sort());
    // Update in selected tags too
    if (selectedTags.includes(editingTag)) {
      onChange(selectedTags.map((t) => (t === editingTag ? newName : t)).join(", "));
    }
    toast.success("Tag renomeada");
    setEditingTag(null);
  };

  const availableTags = allTags.filter((t) => !selectedTags.includes(t));

  return (
    <div className="space-y-2">
      {/* Selected tags */}
      <div className="flex flex-wrap gap-1 min-h-[32px] p-1.5 rounded-md border border-input bg-background">
        {selectedTags.length === 0 && (
          <span className="text-sm text-muted-foreground px-1">Nenhuma tag</span>
        )}
        {selectedTags.map((tag) => (
          <Badge key={tag} variant="secondary" className="text-xs gap-1 pr-1">
            {tag}
            <button
              type="button"
              onClick={() => toggleTag(tag)}
              className="ml-0.5 hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      {/* Popover to add tags */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" type="button" className="w-full justify-between">
            Adicionar tag
            <ChevronDown className="ml-2 h-3.5 w-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-2 space-y-2" align="start">
          {/* Create new tag */}
          <div className="flex gap-1">
            <Input
              placeholder="Nova tag..."
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addNewTag();
                }
              }}
              className="h-8 text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={addNewTag}
              disabled={!newTag.trim()}
              className="h-8 px-2"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Available tags list */}
          <div className="max-h-[200px] overflow-y-auto space-y-0.5">
            {availableTags.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">
                Todas as tags já selecionadas
              </p>
            ) : (
              availableTags.map((tag) => (
                <div key={tag} className="flex items-center gap-1 group">
                  {editingTag === tag ? (
                    <div className="flex items-center gap-1 flex-1">
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
                          if (e.key === "Escape") setEditingTag(null);
                        }}
                        className="h-7 text-sm flex-1"
                        autoFocus
                      />
                      <Button variant="ghost" size="icon" type="button" onClick={saveEdit} className="h-7 w-7">
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      </Button>
                      <Button variant="ghost" size="icon" type="button" onClick={() => setEditingTag(null)} className="h-7 w-7">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className="flex-1 text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors truncate"
                      >
                        {tag}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(tag)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent transition-all"
                        title="Editar tag"
                      >
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTag(tag)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 transition-all"
                        title="Excluir tag"
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
