import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useProject, Project } from "@/contexts/ProjectContext";
import { toast } from "sonner";

interface ProjectSettingsDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectSettingsDialog({
  project,
  open,
  onOpenChange,
}: ProjectSettingsDialogProps) {
  const { updateProject } = useProject();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(project.name);
      setDescription(project.description || "");
    }
  }, [open, project]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Proje adı boş olamaz");
      return;
    }

    setIsSaving(true);
    try {
      await updateProject(project.id, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      toast.success("Proje ayarları güncellendi");
      onOpenChange(false);
    } catch (error) {
      console.error("Error updating project:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Proje Ayarları</DialogTitle>
          <DialogDescription>
            Proje adını ve açıklamasını düzenleyin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Proje Adı</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Proje adı..."
              className="bg-background"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">Açıklama</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Proje açıklaması (opsiyonel)..."
              className="bg-background resize-none min-h-[100px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            İptal
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
