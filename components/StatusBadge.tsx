export function StatusBadge({ status }: { status: string }) {
  const slug = status.toLowerCase().replaceAll(" ", "-").replaceAll("ó", "o");
  return <span className={`status-badge status-${slug}`}>{status}</span>;
}
