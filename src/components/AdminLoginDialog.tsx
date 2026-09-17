import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, AlertCircle } from "lucide-react";

interface AdminLoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogin: (password: string) => Promise<boolean>;
}

export function AdminLoginDialog({ open, onOpenChange, onLogin }: AdminLoginDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await onLogin(password);
    if (success) {
      setPassword("");
      setError(false);
      onOpenChange(false);
    } else {
      setError(true);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setPassword("");
      setError(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Admin Girişi
          </DialogTitle>
          <DialogDescription>
            Kullanım loglarına erişmek için admin parolasını girin.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-password">Parola</Label>
            <Input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(false);
              }}
              placeholder="Admin parolası"
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Geçersiz parola
              </p>
            )}
          </div>
          <Button type="submit" className="w-full">
            Giriş Yap
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
