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
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleAccept = async () => {
    setSubmitting(true);
    await onSubmit({ name, url });
    setSubmitting(false);
    onOpenChange(false);
    setName("");
    setUrl("");
  };

  const handleCancel = () => {
    onOpenChange(false);
    setName("");
    setUrl("");
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
        <div className="space-y-4 py-2">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="mcp-name">Name</label>
            <Input
              id="mcp-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Server Name"
              required
              size="base"
              onValueChange={undefined}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="mcp-url">URL</label>
            <Input
              id="mcp-url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
              size="base"
              onValueChange={undefined}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" onClick={handleCancel} disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" variant="primary" onClick={handleAccept} disabled={submitting || !name || !url || !localUrl}>
            {submitting ? "Adding..." : "Add MCP Server"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 