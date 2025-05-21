import { useForm } from "react-hook-form";
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
  onSubmit: (data: { name: string; url: string }) => void;
}

export function AddMcpServerDialog({
  open,
  onOpenChange,
  onSubmit,
}: AddMcpServerDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<{ name: string; url: string }>({
    defaultValues: { name: "", url: "" },
  });

  const onFormSubmit = async (data: { name: string; url: string }) => {
    await onSubmit(data);
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
          <DialogTitle className="dark:text-white">Add MCP Server</DialogTitle>
          <DialogDescription className="dark:text-neutral-300">
            Enter the details for the new MCP server connection.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4 py-2" onSubmit={handleSubmit(onFormSubmit)}>
          <div>
            <label
              className="block text-sm font-medium mb-1 text-neutral-900 dark:text-neutral-100"
              htmlFor="mcp-name"
            >
              Name
            </label>
            <Input
              id="mcp-name"
              placeholder="Server Name"
              aria-invalid={!!errors.name}
              {...register("name", { required: "Name is required" })}
            />
            {errors.name && (
              <span className="text-red-500 dark:text-red-400 text-xs mt-1 block">
                {errors.name.message}
              </span>
            )}
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1 text-neutral-900 dark:text-neutral-100"
              htmlFor="mcp-url"
            >
              URL
            </label>
            <Input
              id="mcp-url"
              placeholder="https://example.com"
              aria-invalid={!!errors.url}
              {...register("url", {
                required: "URL is required",
                pattern: {
                  value: /^https?:\/\/.+$/,
                  message: "Enter a valid URL (must start with http(s)://)",
                },
              })}
            />
            {errors.url && (
              <span className="text-red-500 dark:text-red-400 text-xs mt-1 block">
                {errors.url.message}
              </span>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="secondary"
                className="dark:bg-neutral-800 dark:border dark:border-neutral-600 dark:text-neutral-100"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add MCP Server"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
