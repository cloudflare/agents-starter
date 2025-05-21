import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/dialog/dialog";
import { Button } from "@/components/button/Button";
import { Input } from "@/components/input/Input";

interface AddMcpServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; url: string; }) => void;
}

export function AddMcpServerDialog({ open, onOpenChange, onSubmit }: AddMcpServerDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  const validate = () => {
    let valid = true;
    if (!name.trim()) {
      setNameError("Name is required");
      valid = false;
    } else {
      setNameError(null);
    }
    if (!url.trim()) {
      setUrlError("URL is required");
      valid = false;
    } else if (!/^https?:\/\/.+$/.test(url)) {
      setUrlError("Enter a valid URL (must start with http(s)://)");
      valid = false;
    } else {
      setUrlError(null);
    }
    return valid;
  };

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    await onSubmit({ name, url });
    setSubmitting(false);
    onOpenChange(false);
    setName("");
    setUrl("");
    setNameError(null);
    setUrlError(null);
  };

  const handleCancel = () => {
    onOpenChange(false);
    setName("");
    setUrl("");
    setNameError(null);
    setUrlError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-100 dark:bg-neutral-900">
        <DialogHeader>
          <DialogTitle>Add MCP Server</DialogTitle>
          <DialogDescription>
            Enter the details for the new MCP server connection.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4 py-2" onSubmit={handleAccept}>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="mcp-name">Name</label>
            <Input
              id="mcp-name"
              className="w-full"
              placeholder="Server Name"
              size="base"
              value={name}
              onValueChange={(val) => setName(val)}
              isValid={!nameError}
            />
            {nameError && (
              <span className="text-red-500 text-xs mt-1 block">{nameError}</span>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="mcp-url">URL</label>
            <Input
              id="mcp-url"
              className="w-full"
              placeholder="https://example.com"
              size="base"
              value={url}
              onValueChange={(val) => setUrl(val)}
              isValid={!urlError}
            />
            {urlError && (
              <span className="text-red-500 text-xs mt-1 block">{urlError}</span>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" onClick={handleCancel} disabled={submitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Adding..." : "Add MCP Server"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 