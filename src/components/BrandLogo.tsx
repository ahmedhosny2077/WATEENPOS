import { cn } from "@/utils/cn";

const SRC = "/brand-logo.png";

export function BrandLogo({
  className,
  alt = "شعار البرنامج",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={SRC}
      alt={alt}
      draggable={false}
      className={cn("object-cover shrink-0 select-none", className)}
    />
  );
}
