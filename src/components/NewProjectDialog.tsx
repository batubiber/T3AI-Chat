import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useProject } from "@/contexts/ProjectContext";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewProjectDialog({ open, onOpenChange }: NewProjectDialogProps) {
  const navigate = useNavigate();
  const { createProject } = useProject();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      const project = await createProject(name.trim(), description.trim() || undefined);
      onOpenChange(false);
      setName("");
      setDescription("");
      navigate(`/projects/${project.id}`);
    } catch (error) {
      console.error("Error creating project:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && name.trim()) {
      e.preventDefault();
      handleCreate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Yeni Proje Oluştur</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Proje Adı</Label>
            <Input
              id="name"
              placeholder="Proje adı girin..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Açıklama (opsiyonel)</Label>
            <Textarea
              id="description"
              placeholder="Proje açıklaması..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || isCreating}
          >
            {isCreating ? "Oluşturuluyor..." : "Oluştur"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
