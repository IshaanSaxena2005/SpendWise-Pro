interface Props { icon: string; className?: string; }
export function CategoryEmoji({ icon, className = '' }: Props) {
  return (
    <span
      className={`category-emoji ${className}`.trim()}
      aria-hidden="true"
      title={icon}
    >
      {icon}
    </span>
  );
}


