import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
              // Sonner sets `width: var(--width)` on the toast element. For long unbroken strings,
              // the flex child `[data-content]` can refuse to shrink (min-width: auto), causing
              // viewport overflow. We clamp width + force flex shrink.
              "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg !w-[min(var(--width),calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden whitespace-normal [overflow-wrap:anywhere] break-all [&_[data-content]]:flex-1 [&_[data-content]]:min-w-0 [&_[data-title]]:whitespace-normal [&_[data-title]]:[overflow-wrap:anywhere] [&_[data-title]]:break-all [&_[data-description]]:whitespace-normal [&_[data-description]]:[overflow-wrap:anywhere] [&_[data-description]]:break-all",
            title: "whitespace-normal [overflow-wrap:anywhere] break-all",
            description: "group-[.toast]:text-muted-foreground whitespace-normal [overflow-wrap:anywhere] break-all",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
