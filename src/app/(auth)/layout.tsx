export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <div className="w-full max-w-md bg-card text-card-foreground rounded-xl shadow-lg border border-border p-8">
        {children}
      </div>
    </div>
  );
}
