import Image from "next/image";

type AvatarProps = {
  src?: string | null;
  name?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-24 w-24 text-2xl",
};

const colorOptions = ["bg-blue-100 text-blue-700", "bg-red-100 text-red-700", "bg-purple-100 text-purple-700", "bg-green-100 text-green-700"];

const getColorByName = (name?: string) => {
  if (!name) return colorOptions[0];
  const code = name.charCodeAt(0) + name.charCodeAt(Math.floor(name.length / 2));
  return colorOptions[code % colorOptions.length];
};

const getInitials = (name?: string) => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export default function Avatar({ src, name, size = "md", className = "" }: AvatarProps) {
  const sizeClass = sizeClasses[size];
  const colorClass = getColorByName(name);
  const initials = getInitials(name);

  if (src) {
    return (
      <div className={`${sizeClass} relative overflow-hidden rounded-full border border-slate-200 bg-white ${className}`}>
        <Image src={src} alt={name || "Avatar"} fill className="object-cover" unoptimized />
      </div>
    );
  }

  return (
    <div className={`${sizeClass} flex items-center justify-center rounded-full border border-slate-200 font-bold ${colorClass} ${className}`}>
      {initials}
    </div>
  );
}
