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
import { useForm } from "react-hook-form";

interface AddMcpServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; url: string; }) => void;
}

type FormValues = {
  name: string;
  url: string;
};

export function AddMcpServerDialog({ open, onOpenChange, onSubmit }: AddMcpServerDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormValues>({
    defaultValues: { name: "", url: "" },
  });

  const handleAccept = async (data: FormValues) => {
    setSubmitting(true);
    await onSubmit(data);
    setSubmitting(false);
    onOpenChange(false);
    reset();
  };

  const handleCancel = () => {
    onOpenChange(false);
    reset();
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
        <form className="space-y-4 py-2" onSubmit={handleSubmit(handleAccept)}>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="mcp-name">Name</label>
            <Input
              id="mcp-name"
              className="w-full"
              placeholder="Server Name"
              size="base"
              {...register("name", { required: "Name is required" })}
              onValueChange={undefined}
            />
            {errors.name && (
              <span className="text-red-500 text-xs mt-1 block">{errors.name.message}</span>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="mcp-url">URL</label>
            <Input
              id="mcp-url"
              className="w-full"
              placeholder="https://example.com"
              size="base"
              {...register("url", {
                required: "URL is required",
                pattern: {
                  value: /^https?:\/\/.+$/,
                  message: "Enter a valid URL (must start with http(s)://)"
                }
              })}
              onValueChange={undefined}
            />
            {errors.url && (
              <span className="text-red-500 text-xs mt-1 block">{errors.url.message}</span>
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