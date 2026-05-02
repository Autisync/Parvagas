import Link from "next/link";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

export default function Breadcrumbs({
  items,
  className = "",
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  return (
    <nav className={`text-sm text-slate-500 ${className}`} aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {item.href && !isLast ? (
                <Link href={item.href} className="hover:text-red-700">
                  {item.label}
                </Link>
              ) : (
                <span className={isLast ? "text-slate-800" : ""}>{item.label}</span>
              )}
              {!isLast ? <span aria-hidden="true">/</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
